import { runLegacyDemoSeed } from './seed'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test seed cannot run with NODE_ENV=production.')
  }

  if (process.env.ALLOW_TEST_FIXTURES !== 'true') {
    throw new Error('Set ALLOW_TEST_FIXTURES=true to run the test seed.')
  }

  await runLegacyDemoSeed()
}

main().catch((error) => {
  console.error('Test seed failed:', error)
  process.exit(1)
})
