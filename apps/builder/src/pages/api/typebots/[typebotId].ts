import { CollaborationType, Prisma } from 'db'
import prisma from '@/lib/prisma'
import { NextApiRequest, NextApiResponse } from 'next'
import { canReadTypebots, canWriteTypebots } from '@/utils/api/dbRules'
import { methodNotAllowed, notAuthenticated } from 'utils/api'
import { getAuthenticatedUser } from '@/features/auth/api'
import { archiveResults } from '@/features/results/api'
import { typebotSchema } from 'models'
import { captureEvent } from '@sentry/nextjs'
import { omit } from 'utils'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const user = await getAuthenticatedUser(req)
  if (!user) return notAuthenticated(res)

  const typebotId = req.query.typebotId as string
  if (req.method === 'GET') {
    const typebot = await prisma.typebot.findFirst({
      where: {
        ...canReadTypebots(typebotId, user),
        isArchived: { not: true },
      },
      include: {
        publishedTypebot: true,
        collaborators: { select: { userId: true, type: true } },
        webhooks: true,
      },
    })
    if (!typebot) return res.send({ typebot: null })
    const { publishedTypebot, collaborators, webhooks, ...restOfTypebot } =
      typebot
    const isReadOnly =
      collaborators.find((c) => c.userId === user.id)?.type ===
      CollaborationType.READ
    return res.send({
      typebot: restOfTypebot,
      publishedTypebot,
      isReadOnly,
      webhooks,
    })
  }

  if (req.method === 'DELETE') {
    const { success } = await archiveResults({
      typebotId,
      user,
      resultsFilter: { typebotId },
    })
    if (!success) return res.status(500).send({ success: false })
    await prisma.publicTypebot.deleteMany({
      where: { typebot: canWriteTypebots(typebotId, user) },
    })
    const typebots = await prisma.typebot.updateMany({
      where: canWriteTypebots(typebotId, user),
      data: { isArchived: true, publicId: null },
    })
    return res.send({ typebots })
  }
  if (req.method === 'PUT') {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const parser = typebotSchema.safeParse({
      ...data,
      updatedAt: new Date(data.updatedAt),
      createdAt: new Date(data.createdAt),
    })
    if ('error' in parser) {
      captureEvent({
        message: 'Typebot schema validation failed',
        extra: {
          typebotId: data.id,
          error: parser.error,
        },
      })
    }
    const existingTypebot = await prisma.typebot.findFirst({
      where: canReadTypebots(typebotId, user),
      select: { updatedAt: true },
    })
    if (
      existingTypebot &&
      existingTypebot?.updatedAt > new Date(data.updatedAt)
    )
      return res.send({ message: 'Found newer version of typebot in database' })
    const typebots = await prisma.typebot.updateMany({
      where: canWriteTypebots(typebotId, user),
      data: removeOldProperties({
        ...data,
        theme: data.theme ?? undefined,
        settings: data.settings ?? undefined,
        resultsTablePreferences: data.resultsTablePreferences ?? undefined,
      }) as Prisma.TypebotUpdateInput,
    })
    return res.send({ typebots })
  }
  if (req.method === 'PATCH') {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const typebots = await prisma.typebot.updateMany({
      where: canWriteTypebots(typebotId, user),
      data,
    })
    return res.send({ typebots })
  }
  return methodNotAllowed(res)
}

// TODO: Remove in a month
const removeOldProperties = (data: unknown) => {
  if (data && typeof data === 'object' && 'publishedTypebotId' in data) {
    return omit(data, 'publishedTypebotId')
  }
  return data
}

export default handler
