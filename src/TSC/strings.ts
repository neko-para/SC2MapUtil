import fs from 'fs/promises'

export class StringManager {
  ts: Record<string, string>
  gs: Record<string, string>

  constructor() {
    this.ts = {}
    this.gs = {}
  }

  loadTS(buf: string) {
    buf
      .split(/[\n\r]+/)
      .filter(x => x)
      .forEach(row => {
        const m = /^([^=]+)=([\s\S]*)$/.exec(row)
        if (!m) {
          console.log(`Unknown TriggerStrings: ${row}`)
          return
        }
        this.ts[m[1]] = m[2]
      })
  }

  loadGS(buf: string) {
    buf
      .split(/[\n\r]+/)
      .filter(x => x)
      .forEach(row => {
        const m = /^([^=]+)=([\s\S]*)$/.exec(row)
        if (!m) {
          console.log(`Unknown GameStrings: ${row}`)
          return
        }
        this.gs[m[1]] = m[2]
      })
  }

  async load(dir: string, locale: string) {
    const bufs = (
      await Promise.all([
        fs.readFile(`${dir}/${locale}/LocalizedData/TriggerStrings.txt`),
        fs.readFile(`${dir}/${locale}/LocalizedData/GameStrings.txt`),
      ])
    ).map(b => b.toString())
    this.loadTS(bufs[0])
    this.loadGS(bufs[1])
  }

  async save(dir: string, locale: string) {
    const tss: string[] = [],
      gss: string[] = []
    for (const k in this.ts) {
      tss.push(`${k}=${this.ts[k]}`)
    }
    for (const k in this.gs) {
      gss.push(`${k}=${this.gs[k]}`)
    }
    return Promise.all([
      fs.writeFile(
        `${dir}/${locale}/LocalizedData/TriggerStrings.txt`,
        tss.join('\n')
      ),
      fs.writeFile(
        `${dir}/${locale}/LocalizedData/GameStrings.txt`,
        gss.join('\n')
      ),
    ])
  }
}
