import { Program } from './TSC/generator.js'

async function main() {
  const p = new Program()
  await p.load('./test/test.sct')
  await p.generate('./test/info.scd')
}

main()
