export function getMediaSourceUrl(mediaUrl: string): string {
  const cdnValue = process.env.ASSET_CDN_URL
  if (!cdnValue) return mediaUrl

  // Payload local media URLs are relative. Keep them unchanged.
  if (!/^https?:\/\//i.test(mediaUrl)) {
    return mediaUrl
  }

  const bucket = process.env.S3_BUCKET
  const region = process.env.AWS_REGION

  if (!bucket || !region || process.env.PAYLOAD_STORAGE !== 's3') {
    throw new Error(
      'ASSET_CDN_URL requires S3_BUCKET, AWS_REGION, and PAYLOAD_STORAGE=s3.',
    )
  }

  const endpointValue =
    process.env.S3_ENDPOINT ||
    `https://s3.${region}.amazonaws.com${region.startsWith('cn-') ? '.cn' : ''}`

  const endpoint = new URL(endpointValue)
  const source = new URL(mediaUrl)
  const cdn = new URL(cdnValue)

  if (
    cdn.protocol !== 'https:' ||
    cdn.pathname !== '/' ||
    cdn.search ||
    cdn.hash ||
    cdn.username ||
    cdn.password
  ) {
    throw new Error(
      'ASSET_CDN_URL must be an HTTPS origin without a path or credentials.',
    )
  }

  const bucketPath = `${endpoint.pathname.replace(/\/$/, '')}/${bucket}/`

  if (source.origin !== endpoint.origin || !source.pathname.startsWith(bucketPath)) {
    return mediaUrl
  }

  const objectKey = source.pathname.slice(bucketPath.length)
  if (!objectKey) return mediaUrl

  return new URL(
    `${objectKey}${source.search}${source.hash}`,
    `${cdn.origin}/`,
  ).toString()
}
