import path from 'path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'
import { en as adminLanguage } from '@payloadcms/translations/languages/en'

import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { Projects } from './collections/Projects'
import { Services } from './collections/Services'
import { JournalArticles } from './collections/JournalArticles'
import { Testimonials } from './collections/Testimonials'
import { Enquiries } from './collections/Enquiries'
import { WebsiteSettings } from './globals/WebsiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value || !value.trim()) {
    throw new Error(`Missing ${name}. Set it in your environment file.`)
  }

  return value
}

const databaseURL = requireEnv('DATABASE_URL')
const payloadSecret = requireEnv('PAYLOAD_SECRET')

const localStorageMode = process.env.PAYLOAD_STORAGE ?? 'local'

// AWS RDS SSL configuration
const rdsSSL = {
  rejectUnauthorized: true,
  ca: readFileSync(
    process.env.RDS_CA_CERT_PATH ??
      '/app/certs/rds-global-bundle.pem',
    'utf8',
  ),
}

// S3 storage configuration
function getS3StorageConfig() {
  if (localStorageMode !== 's3') {
    return undefined
  }

  const bucket = requireEnv('S3_BUCKET')
  const region = requireEnv('AWS_REGION')

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      'Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or omit both to use the AWS runtime role.',
    )
  }

  const endpoint =
    process.env.S3_ENDPOINT ??
    `https://s3.${region}.amazonaws.com${region.startsWith('cn-') ? '.cn' : ''}`

  const mediaCollection = process.env.S3_PREFIX
    ? { prefix: process.env.S3_PREFIX }
    : (true as const)

  return {
    bucket,
    collections: {
      media: mediaCollection,
    },
    config: {
      region,
      endpoint,
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
              ...(process.env.AWS_SESSION_TOKEN
                ? { sessionToken: process.env.AWS_SESSION_TOKEN }
                : {}),
            },
          }
        : {}),
    },
  }
}

if (localStorageMode !== 'local' && localStorageMode !== 's3') {
  throw new Error('PAYLOAD_STORAGE must be either "local" or "s3".')
}

const s3Config = getS3StorageConfig()
const storageAdapters = s3Config ? [s3Storage(s3Config)] : []

export default buildConfig({
  admin: {
    user: Admins.slug,
    routes: {
      logout: '/signed-out' as const,
    },
    constrainWidth: true,
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'activity' as const, width: 'full' as const },
        { widgetSlug: 'collections' as const, width: 'full' as const },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  i18n: {
    fallbackLanguage: 'en' as const,
    supportedLanguages: {
      en: adminLanguage,
    },
  },

  collections: [
    Admins,
    Media,
    Folders,
    Tags,
    Projects,
    Services,
    JournalArticles,
    Testimonials,
    Enquiries,
  ],

  globals: [WebsiteSettings],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },

  storage: storageAdapters,

  db: postgresAdapter({
    push: false,

    pool: {
      connectionString: databaseURL,
      ssl: rdsSSL,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 60_000,
    },

    migrationDir: path.resolve(dirname, 'migrations'),
  }),

  secret: payloadSecret,
})
