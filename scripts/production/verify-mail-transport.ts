import { SMTPServer } from 'smtp-server'
import { sendTestEmail } from '@/lib/auth-code'

async function main() {
  const received: string[] = []

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, _session, callback) {
      let raw = ''
      stream.on('data', (chunk) => {
        raw += chunk.toString('utf8')
      })
      stream.on('end', () => {
        received.push(raw)
        callback(null)
      })
    },
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(2526, '127.0.0.1', (error?: Error | null) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = '2526'
  process.env.SMTP_SECURE = 'false'
  process.env.MAIL_FROM = 'release-test@example.com'

  try {
    await sendTestEmail('delivery-check@example.com')
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (received.length === 0) {
      throw new Error('No SMTP message was captured.')
    }

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          messagesCaptured: received.length,
          containsSubject: /SMTP test email/i.test(received[0]),
        },
        null,
        2
      )
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
