import { Program } from './TSC/generator.js'

const dir = 'C:/Users/nekosu/Desktop/1.SC2Map'
const locale = 'zhCN.SC2Data'

async function main() {
  const p = new Program()
  try {
    await p.load('./test/test.sct')
    await p.generate('./test/info.scd', dir, locale)
  } catch (msg) {
    console.log(msg)
  }
}

main()
