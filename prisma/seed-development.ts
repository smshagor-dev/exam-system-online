import { runLegacyDemoSeed } from './seed'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development demo seed cannot run with NODE_ENV=production.')
  }

  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Set ALLOW_DEMO_SEED=true to run the development demo seed.')
  }

  await runLegacyDemoSeed()
}

main().catch((error) => {
  console.error('Development seed failed:', error)
  process.exit(1)
})
