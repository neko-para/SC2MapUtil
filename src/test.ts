import { Program } from './TSC/generator.js'

async function main() {
  const p = new Program()
  try {
    await p.load('./test/test.sct')
    await p.generate('./test/info.scd')
  } catch (msg) {
    console.log(msg)
  }
}

main()
