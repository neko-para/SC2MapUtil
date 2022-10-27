function dump<T>(v: T): T {
  if (typeof v === "object") {
    if (v instanceof Function) {
      return v
    } else if (v instanceof Array) {
      return v.map(dump) as T
    } else {
      const r: any = {}
      for (const k in v) {
        r[k] = dump(v[k])
      }
      return r
    }
  } else {
    return v
  }
}

interface Token {
  name: string
  raw: string
  value: any
  pos: number
}

interface TokenTyper {
  [key: string]: any
}

type ExTokenType<T, TokenType> = T extends keyof TokenType
  ? TokenType[T]
  : never

type ExTokenTypes<Tuple extends [...any[]], TokenType> = {
  [Index in keyof Tuple]: ExTokenType<Tuple[Index], TokenType>
}

export class Rule<
  TokenType extends TokenTyper,
  Keyset extends keyof TokenType & string = keyof TokenType & string
> {
  parser: SimpleParser<TokenType>
  id: number

  constructor(p: SimpleParser<TokenType>) {
    this.parser = p
    this.id = 0
  }

  gen() {
    return `%${++this.id}`
  }

  with(func: (rule: Rule<TokenType>) => (rule: Rule<TokenType>) => void) {
    func(this)(this)
    return this
  }

  typelessFor<T>(prop: string): RuleStep1<TokenType, T> {
    this.parser.parseRule[prop] = this.parser.parseRule[prop] || []
    return new RuleStep1<TokenType, T>(this, prop)
  }

  for<K extends Keyset>(prop: K) {
    return this.typelessFor<TokenType[K]>(prop)
  }

  _some<K1 extends Keyset, K2 extends Keyset>(prop: K1, key: K2) {
    return (r: Rule<TokenType>) => {
      r.for(prop)
        .when()
        .do(() => [] as TokenType[K1])
        .when(key)
        .do(x => [x] as TokenType[K1])
        .when(key)
        .withloop<TokenType[K2]>()
        .when(key)
        .do(x => x)
        .do((x, ys) => [x, ...ys] as TokenType[K1])
    }
  }

  _some_sep<K1 extends Keyset, K2 extends Keyset, K3 extends Keyset[]>(
    prop: K1,
    key: K2,
    ...sep: K3
  ) {
    return (r: Rule<TokenType>) => {
      r.for(prop)
        .when()
        .do(() => [] as TokenType[K1])
        .when(key)
        .do(x => [x] as TokenType[K1])
        .when(key)
        .withloop<TokenType[K2]>()
        .when(...sep, key)
        .do((...xs) => xs[xs.length - 1] as TokenType[K2])
        .do((x, ys) => [x, ...ys] as TokenType[K1])
    }
  }

  entry(key: Keyset) {
    return this.typelessFor("%entry")
      .when(key)
      .do(x => x)
  }
}

class RuleStep1<
  TokenType extends TokenTyper,
  RET,
  Keyset extends keyof TokenType & string = keyof TokenType & string
> {
  rule: Rule<TokenType>
  prop: string

  constructor(r: Rule<TokenType>, p: string) {
    this.rule = r
    this.prop = p
  }

  for(prop: Keyset) {
    return this.rule.for(prop)
  }

  with(func: (rule: Rule<TokenType>) => (rule: Rule<TokenType>) => void) {
    return this.rule.with(func)
  }

  sameas(...keys: Keyset[]) {
    for (const key of keys) {
      this.rule.parser.parseRule[this.prop].push([[key], v => v])
    }
    return this
  }

  when<KS extends Keyset[]>(...keys: KS): RuleStep2<TokenType, RET, KS> {
    return new RuleStep2<TokenType, RET, KS>(this, keys)
  }
}

class RuleStep2<
  TokenType extends TokenTyper,
  RET,
  KS extends (keyof TokenType & string)[]
> {
  step1: RuleStep1<TokenType, RET>
  keys: KS

  constructor(s: RuleStep1<TokenType, RET>, k: KS) {
    this.step1 = s
    this.keys = k
  }

  do(func: (...vals: ExTokenTypes<KS, TokenType>) => RET) {
    this.step1.rule.parser.parseRule[this.step1.prop].push([this.keys, func])
    return this.step1
  }

  withloop<MT>() {
    const r = this.step1.rule.typelessFor<MT>(this.step1.rule.gen())
    const rr = this.step1.rule.typelessFor<MT[]>(this.step1.rule.gen())
    rr.when(r.prop)
      .do(x => [x])
      .when(r.prop, rr.prop)
      .do((x, ys) => [x, ...ys])

    return new RuleStep3<TokenType, RET, KS, MT>(this, r, rr.prop)
  }
}

class RuleStep3<
  TokenType extends TokenTyper,
  RET,
  KS extends (keyof TokenType & string)[],
  MT,
  Keyset extends keyof TokenType & string = keyof TokenType & string
> {
  step2: RuleStep2<TokenType, RET, KS>
  loopr: RuleStep1<TokenType, MT>
  rrk: string

  constructor(
    s2: RuleStep2<TokenType, RET, KS>,
    r: RuleStep1<TokenType, MT>,
    k: string
  ) {
    this.step2 = s2
    this.loopr = r
    this.rrk = k
  }

  when<KS2 extends Keyset[]>(
    ...keys: KS2
  ): RuleStep4<TokenType, RET, KS, KS2, MT> {
    return new RuleStep4<TokenType, RET, KS, KS2, MT>(this, keys)
  }

  do(func: (...vars: [...ExTokenTypes<KS, TokenType>, MT[]]) => RET) {
    this.step2.step1.rule.parser.parseRule[this.step2.step1.prop] =
      this.step2.step1.rule.parser.parseRule[this.step2.step1.prop] || []
    this.step2.step1.rule.parser.parseRule[this.step2.step1.prop].push([
      [...this.step2.keys, this.rrk],
      func,
    ])
    return this.step2.step1
  }
}

class RuleStep4<
  TokenType extends TokenTyper,
  RET,
  KS extends (keyof TokenType & string)[],
  KS2 extends (keyof TokenType & string)[],
  MT
> {
  step3: RuleStep3<TokenType, RET, KS, MT>
  keys: KS2

  constructor(s: RuleStep3<TokenType, RET, KS, MT>, k: KS2) {
    this.step3 = s
    this.keys = k
  }

  do(func: (...vals: ExTokenTypes<KS2, TokenType>) => MT) {
    this.step3.loopr.when(...this.keys).do(func)
    return this.step3
  }
}

export class SimpleParser<TokenType extends TokenTyper> {
  ignRule: RegExp
  keyWords: (keyof TokenType & string)[]
  lexRule: {
    [key in keyof TokenType & string]?: RegExp
  }
  parseRule: Record<string, [string[], (...k: any[]) => any][]>
  postProcess: {
    [key in keyof TokenType & string]?: (s: string) => TokenType[key]
  }
  rule: Rule<TokenType>
  tokens: Token[]
  error: {
    pos: number
    meet: string
    choice: Set<string>
  }

  constructor(
    ign: RegExp,
    lex: {
      [key in keyof TokenType & string]?: RegExp
    },
    post: {
      [key in keyof TokenType & string]?: (s: string) => TokenType[key]
    } = {},
    keywords: (keyof TokenType & string)[] = []
  ) {
    this.ignRule = ign
    this.keyWords = keywords
    this.lexRule = lex
    this.postProcess = post
    this.parseRule = {
      "%": [[["$begin", "%entry", "$end"], (_, v) => v]],
    }

    this.rule = new Rule(this)
    this.tokens = []
    this.error = {
      pos: -1,
      meet: "",
      choice: new Set(),
    }
  }

  canLex(text: string, rule: RegExp): [true, number] | [false, -1] {
    const m = rule.exec(text)
    if (m && m.index === 0) {
      return [true, m[0].length]
    } else {
      return [false, -1]
    }
  }

  *doLex(text: string): Generator<Token> {
    let pos = 0
    while (text.length > 0) {
      const [r, i] = this.canLex(text, this.ignRule)
      if (r) {
        text = text.substring(i)
        pos += i
        continue
      }
      let ppos = pos
      for (const key of this.keyWords) {
        const t = key.substring(1)
        if (text.startsWith(t)) {
          const tk = {
            name: key,
            raw: t,
            value: t,
            pos,
          }
          if (key in this.postProcess) {
            tk.value = this.postProcess[key](tk.value)
          }
          yield tk
          text = text.substring(t.length)
          pos += t.length
          break
        }
      }
      if (pos !== ppos) {
        continue
      }
      for (const name in this.lexRule) {
        const rule = this.lexRule[name]
        const [r, i] = this.canLex(text, rule)
        if (r) {
          const tk = {
            name: name,
            raw: text.substring(0, i),
            value: text.substring(0, i),
            pos,
          }
          if (name in this.postProcess) {
            tk.value = this.postProcess[name](tk.value)
          }
          yield tk
          text = text.substring(i)
          pos += i
          break
        }
      }
      if (ppos === pos) {
        throw [`Failed to lex around ${pos}`]
      }
    }
  }

  matchGrammar(
    grammar: string[],
    gptr: number,
    ptr: number,
    cache: any[],
    result: [any, number][]
  ) {
    if (grammar.length === gptr) {
      result.push([dump(cache), ptr])
      return
    }
    const [r, v] = this.doParse(grammar[gptr], ptr)
    if (!r) {
      return
    }
    for (const [value, offset] of v) {
      cache.push(value)
      this.matchGrammar(grammar, gptr + 1, ptr + offset, cache, result)
      cache.pop()
    }
  }

  doParse(name: string, ptr = 0): [boolean, [any, number][]] {
    if (ptr >= this.tokens.length) {
      return [false, []]
    }
    if (name.startsWith("$")) {
      if (this.tokens[ptr].name === name) {
        return [true, [[this.tokens[ptr].value, 1]]]
      } else {
        if (this.tokens[ptr].pos > this.error.pos) {
          this.error.pos = this.tokens[ptr].pos
          this.error.meet = this.tokens[ptr].name
          this.error.choice = new Set([name])
        } else if (this.tokens[ptr].pos === this.error.pos) {
          this.error.choice.add(name)
        }
        return [false, []]
      }
    }
    const opts = this.parseRule[name]
    if (!opts) {
      console.log(this.parseRule)
      throw [ `Unknown expr ${name}` ]
    }
    const result: [any, number][] = []
    for (const [grammar, process] of opts) {
      const tmp = []
      this.matchGrammar(grammar, 0, ptr, [], tmp)
      tmp.forEach(([v, p]) => {
        result.push([process(...v), p - ptr])
      })
    }
    return [result.length > 0, result]
  }

  parse(text: string) {
    this.error = {
      pos: -1,
      meet: "",
      choice: new Set(),
    }
    this.tokens = [
      {
        name: "$begin",
        raw: "",
        value: null,
        pos: 0,
      },
    ]
    for (const token of this.doLex(text)) {
      this.tokens.push(token)
    }
    this.tokens.push({
      name: "$end",
      raw: "",
      value: null,
      pos: 0,
    })
    const [state, result] = this.doParse("%")
    if (state) {
      if (result.length > 1) {
        console.log("multiple result detected!")
      }
      return result[0][0]
    } else {
      throw [
        `Parse failed at pos ${this.error.pos}, around ${text.substring(
          this.error.pos - 10,
          this.error.pos
        )} >> ${text.substring(this.error.pos, this.error.pos + 10)}
Want ${Array.from(this.error.choice.keys()).join(", ")}
Meet ${this.error.meet}`,
        this.error,
      ]
    }
  }
}
