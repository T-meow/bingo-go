export const ATTACHMENTS_CAPABILITY = 'attachments.input.v1'
export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif'

export type ComposerImageAttachment = {
  id: string
  name: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif'
  size: number
  data: string
  previewUrl: string
  status: 'preparing' | 'ready' | 'uploading' | 'uploaded' | 'error'
  marker?: string
  normalizedMediaType?: 'image/png' | 'image/jpeg'
  error?: string
}

export async function prepareComposerAttachment(file: File): Promise<ComposerImageAttachment> {
  const mediaType = imageMediaType(file)
  if (!mediaType) throw new Error(`${file.name || '图片'}：仅支持 PNG、JPEG 和 GIF`)
  if (file.size <= 0) throw new Error(`${file.name || '图片'}：文件为空`)
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name || '图片'}：原文件不能超过 32 MiB`)
  const previewUrl = URL.createObjectURL(file)
  try {
    return {
      id: crypto.randomUUID(),
      name: file.name || '剪贴板图片',
      mediaType,
      size: file.size,
      data: await readBase64(file),
      previewUrl,
      status: 'ready'
    }
  } catch (error) {
    URL.revokeObjectURL(previewUrl)
    throw error
  }
}

export function revokeAttachmentPreview(attachment: ComposerImageAttachment): void {
  if (attachment.previewUrl.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl)
}

function imageMediaType(file: File): ComposerImageAttachment['mediaType'] | null {
  if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/gif') return file.type
  const extension = file.name.toLocaleLowerCase().match(/\.(png|jpe?g|gif)$/)?.[1]
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'gif') return 'image/gif'
  return null
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`${file.name || '图片'}：读取失败`))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`${file.name || '图片'}：读取失败`))
        return
      }
      const separator = reader.result.indexOf(',')
      if (separator < 0) {
        reject(new Error(`${file.name || '图片'}：编码失败`))
        return
      }
      resolve(reader.result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
}
