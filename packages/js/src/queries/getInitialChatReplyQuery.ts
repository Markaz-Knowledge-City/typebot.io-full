import { InitialChatReply } from '@/types'
import { guessApiHost } from '@/utils/guessApiHost'
import type { SendMessageInput, StartParams } from 'models'
import { isNotEmpty, sendRequest } from 'utils'

export async function getInitialChatReplyQuery({
  typebot,
  isPreview,
  apiHost,
  prefilledVariables,
  startGroupId,
  resultId,
}: StartParams & {
  apiHost?: string
}) {
  if (!typebot)
    throw new Error('Typebot ID is required to get initial messages')

  return sendRequest<InitialChatReply>({
    method: 'POST',
    url: `${isNotEmpty(apiHost) ? apiHost : guessApiHost()}/api/v1/sendMessage`,
    body: {
      startParams: {
        isPreview,
        typebot,
        prefilledVariables,
        startGroupId,
        resultId,
      },
    } satisfies SendMessageInput,
  })
}
