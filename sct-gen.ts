import fs from "fs/promises"
import type {
  AstNodeActionDefine,
  AstNodeFunctionDefine,
  AstNodeParamDefine,
  AstNodeSection,
  AstNodeTriggerDefine,
  AstNodeVariableDefine,
  AstNodeValue,
  AstNodeActionCall,
} from "./sct-parse.js"
import { CreateParser } from "./sct-parse.js"
import { saveXml, XmlNode } from "./xml.js"

const TypeName = {
  文本: "text",
  字符串: "string",
  整数: "int",
  布尔: "bool",
}

interface ParamInfo {
  id: string
  lib?: string
  name: string
  type: string
}

interface FunctionInfo {
  id: string
  lib?: string
  ret?: string
  param: ParamInfo[]
}

class Context {
  param: Record<string, string>
  variable: Record<string, string>

  constructor() {
    this.param = {}
    this.variable = {}
  }
}

function VariableRefer(id: string, lib: string) {
  return {
    tag: "Variable",
    attr: {
      Type: "Variable",
      Library: lib,
      Id: id,
    },
    child: [],
  }
}

function ParamRefer(id: string, lib: string) {
  return {
    tag: "Parameter",
    attr: {
      Type: "ParamDef",
      Library: lib,
      Id: id,
    },
    child: [],
  }
}

class Library {
  __ID: number
  prog: Program
  libid: string | undefined
  Root: XmlNode
  Elements: XmlNode[]

  Triggers: Record<string, AstNodeTriggerDefine & { id: string }>
  Functions: Record<string, AstNodeFunctionDefine & { id: string }>
  Actions: Record<string, AstNodeActionDefine & { id: string }>

  constructor(p: Program, lid?: string) {
    this.__ID = 0x10000000
    this.prog = p
    this.libid = lid
    this.Root = {
      tag: "Root",
      attr: {},
      child: [],
    }
    this.Elements = []
    this.Triggers = {}
    this.Functions = {}
    this.Actions = {}
  }

  genId() {
    return (++this.__ID).toString(16).toUpperCase().padStart(8)
  }

  DirectValue(s: string, type: string) {
    return [
      {
        tag: "Value",
        attr: {},
        child: [
          {
            tag: "#text",
            attr: {
              text: s,
            },
            child: [],
          },
        ],
      },
      {
        tag: "ValueType",
        attr: {
          Type: type,
        },
        child: [],
      },
    ]
  }

  DirectString(s: string) {
    return this.DirectValue(s, "string")
  }

  DirectInt(i: number) {
    return this.DirectValue(i.toString(), "int")
  }

  DirectBoolean(b: boolean) {
    return this.DirectValue(b.toString(), "bool")
  }

  DirectText(id: string, s: string) {
    this.prog.GameStrings.push(`Param/Value/${id}=${s}`) // TODO: escape
    return {
      tag: "ValueType",
      attr: {
        Type: "text",
      },
      child: [],
    }
  }

  FunctionCall(ctx: Context, func: string, params: AstNodeValue[]) {
    const id = this.genId()
    const fi = this.prog.QueryFunction(func)
    const el: XmlNode = {
      tag: "Element",
      attr: {
        Type: "FunctionCall",
        Id: id,
      },
      child: [
        {
          tag: "FunctionDef",
          attr: {
            Type: "FunctionDef",
            Library: fi.lib,
            Id: fi.id,
          },
          child: [],
        },
      ],
    }
    const app = [el]
    params.forEach((p, i) => {
      const { id: pid, els } = this.CreateParam(p, ctx, fi.param[i])
      el.child.push({
        tag: "Parameter",
        attr: {
          Type: "Param",
          Library: this.libid,
          Id: pid,
        },
        child: [],
      })
      app.push(...els)
    })
    return {
      id,
      els: app,
    }
  }

  CreateParam(ast: AstNodeValue, ctx: Context, pi?: ParamInfo) {
    const id = this.genId()
    const el = {
      tag: "Element",
      attr: {
        Type: "Param",
        Id: id,
      },
      child: [],
    }
    const app: XmlNode[] = [el]
    if (pi) {
      el.child.push({
        tag: "ParameterDef",
        attr: {
          Type: "ParamDef",
          Library: pi.lib,
          Id: pi.id,
        },
        child: [],
      })
    }
    switch (ast.astType) {
      case "text-value":
        el.child.push(this.DirectText(id, ast.text))
        break
      case "str-value":
        el.child.push(...this.DirectString(ast.str))
        break
      case "int-value":
        el.child.push(...this.DirectInt(ast.int))
        break
      case "bool-value":
        el.child.push(...this.DirectBoolean(ast.bool))
        break
      case "var-ref": {
        if (ast.variable in ctx.variable) {
          el.child.push(VariableRefer(ctx.variable[ast.variable], this.libid))
        } else if (ast.variable in ctx.param) {
          el.child.push(ParamRefer(ctx.param[ast.variable], this.libid))
        } else {
          throw "unknown variable or param " + ast.variable
        }
        break
      }
      case "func-call": {
        const { id: eid, els } = this.FunctionCall(ctx, ast.func, ast.params)
        el.child.push({
          tag: "FunctionCall",
          attr: {
            Type: "FunctionCall",
            Library: this.libid,
            Id: eid,
          },
          child: [],
        })
        app.push(...els)
        break
      }
      case "preset-value": {
        const pi = this.prog.Declare.Presets[ast.preset]
        el.child.push({
          tag: "Preset",
          attr: {
            Type: "PresetValue",
            Library: pi.lib,
            Id: pi.value[ast.child],
          },
          child: [],
        })
        break
      }
    }
    return {
      id,
      els: app,
    }
  }

  LibStringKey () {
    return this.libid ? `lib_${this.libid}_` : ''
  }

  VariableDefine(v: AstNodeVariableDefine, ctx: Context) {
    const id = this.genId()
    const el = {
      tag: "Element",
      attr: {
        Type: "Variable",
        Id: id,
      },
      child: [
        {
          tag: "VariableType",
          attr: {},
          child: [
            {
              tag: "Type",
              attr: {
                Value: TypeName[v.type],
              },
              child: [],
            },
          ],
        },
      ],
    }
    const app: XmlNode[] = [el]
    const { id: pid, els } = this.CreateParam(v.value, ctx)
    app.push(...els)
    el.child.push({
      tag: "Value",
      attr: {
        Type: "Param",
        Library: this.libid,
        Id: pid,
      },
      child: [],
    })
    this.prog.TriggerStrings.push(`Variable/Name/${this.LibStringKey()}${id}=${v.variable}`)
    return { id, els: app }
  }

  ParamDefine(id: string, v: AstNodeParamDefine, ctx: Context) {
    const el = {
      tag: "Element",
      attr: {
        Type: "ParamDef",
        Id: id,
      },
      child: [
        {
          tag: "ParameterType",
          attr: {},
          child: [
            {
              tag: "Type",
              attr: {
                Value: TypeName[v.type],
              },
              child: [],
            },
          ],
        },
      ],
    }
    this.prog.TriggerStrings.push(`ParamDef/Name/${this.LibStringKey()}${id}=${v.name}`)
    return { id, els: [el] }
  }

  Load(aa: AstNodeSection) {
    const a = {
      id: this.genId(),
      ...aa,
    }
    switch (a.astType) {
      case "trigger-def":
        this.Root.child.push({
          tag: "Item",
          attr: {
            Type: "Trigger",
            Library: this.libid,
            Id: a.id,
          },
          child: [],
        })
        this.prog.TriggerStrings.push(`Trigger/Name/${this.LibStringKey()}${a.id}=${a.desc}`)
        this.Triggers[a.name] = a
        break
      case "func-def":
        this.Root.child.push({
          tag: "Item",
          attr: {
            Type: "FunctionDef",
            Library: this.libid,
            Id: a.id,
          },
          child: [],
        })
        this.prog.TriggerStrings.push(`FunctionDef/Name/${this.LibStringKey()}${a.id}=${a.desc}`)
        this.Functions[a.name] = a
        this.prog.Declare.Functions[a.name] = {
          id: a.id,
          lib: this.libid,
          param: a.params.map(p => ({
            ...p,
            id: this.genId(),
            lib: this.libid,
          })),
          ret: a.ret,
        }
        break
      case "act-def":
        this.Root.child.push({
          tag: "Item",
          attr: {
            Type: "FunctionDef",
            Library: this.libid,
            Id: a.id,
          },
          child: [],
        })
        this.prog.TriggerStrings.push(`FunctionDef/Name/${this.LibStringKey()}${a.id}=${a.desc}`)
        this.Actions[a.name] = a
        this.prog.Declare.Actions[a.name] = {
          id: a.id,
          lib: this.libid,
          param: a.params.map(p => ({
            ...p,
            id: this.genId(),
            lib: this.libid,
          })),
        }
        break
    }
  }

  BuildParam(ctx: Context, p: AstNodeParamDefine, id: string) {
    const { id: _, els } = this.ParamDefine(id, p, ctx)
    ctx.param[p.name] = id
    this.Elements.push(...els)
    return {
      tag: "Parameter",
      attr: {
        Type: "ParamDef",
        Library: this.libid,
        Id: id,
      },
      child: [],
    }
  }

  BuildVariable(ctx: Context, v: AstNodeVariableDefine) {
    const { id, els } = this.VariableDefine(v, ctx)
    ctx.variable[v.variable] = id
    this.Elements.push(...els)
    return {
      tag: "Variable",
      attr: {
        Type: "Variable",
        Library: this.libid,
        Id: id,
      },
      child: [],
    }
  }

  BuildStatementAct(ctx: Context, s: AstNodeActionCall) {
    const { id, els } = this.FunctionCall(ctx, s.func, s.params)
    this.Elements.push(...els)
    return {
      tag: "Action",
      attr: {
        Type: "FunctionCall",
        Library: this.libid,
        Id: id,
      },
      child: [],
    }
  }

  BuildStatement(ctx: Context, s: AstNodeActionCall) {
    const { id, els } = this.FunctionCall(ctx, s.func, s.params)
    this.Elements.push(...els)
    return {
      tag: "FunctionCall",
      attr: {
        Type: "FunctionCall",
        Library: this.libid,
        Id: id,
      },
      child: [],
    }
  }

  Build() {
    for (const k in this.Triggers) {
      const t = this.Triggers[k]
      const ctx = new Context()

      const el = {
        tag: "Element",
        attr: {
          Type: "Trigger",
          Id: t.id,
        },
        child: [],
      }
      this.Elements.push(el)

      el.child.push(...t.vars.map(v => this.BuildVariable(ctx, v)))

      {
        const { id, els } = this.FunctionCall(ctx, t.event.func, t.event.params)
        this.Elements.push(...els)
        el.child.push({
          tag: "Event",
          attr: {
            Type: "FunctionCall",
            Library: this.libid,
            Id: id,
          },
          child: [],
        })
      }

      el.child.push(...t.statements.map(s => this.BuildStatementAct(ctx, s)))
    }

    for (const k in this.Functions) {
      const t = this.Functions[k]
      const ctx = new Context()
      const pis = this.prog.QueryFunction(k).param

      const el = {
        tag: "Element",
        attr: {
          Type: "FunctionDef",
          Id: t.id,
        },
        child: [
          {
            tag: "FlagCall",
            attr: {},
            child: [],
          },
          {
            tag: "ReturnType",
            attr: {},
            child: [
              {
                tag: "Type",
                attr: {
                  Value: TypeName[t.ret],
                },
                child: [],
              },
            ],
          },
        ],
      }
      this.Elements.push(el)

      el.child.push(...t.params.map((p, i) => this.BuildParam(ctx, p, pis[i].id)))

      el.child.push(...t.vars.map(v => this.BuildVariable(ctx, v)))

      el.child.push(...t.statements.map(s => this.BuildStatement(ctx, s)))
    }

    for (const k in this.Actions) {
      const t = this.Actions[k]
      const ctx = new Context()
      const pis = this.prog.QueryFunction(k).param

      const el = {
        tag: "Element",
        attr: {
          Type: "FunctionDef",
          Id: t.id,
        },
        child: [
          {
            tag: "FlagAction",
            attr: {},
            child: [],
          }
        ],
      }
      this.Elements.push(el)

      el.child.push(...t.params.map((p, i) => this.BuildParam(ctx, p, pis[i].id)))

      el.child.push(...t.vars.map(v => this.BuildVariable(ctx, v)))

      el.child.push(...t.statements.map(s => this.BuildStatement(ctx, s)))
    }

    return [this.Root, ...this.Elements]
  }
}

class Program {
  GameStrings: string[]
  TriggerStrings: string[]

  Declare: {
    Presets: Record<string, { lib: string; value: Record<string, string> }>
    Functions: Record<string, FunctionInfo>
    Actions: Record<string, FunctionInfo>
    Events: Record<string, FunctionInfo>
  }

  Lib: Record<string, Library>

  constructor() {
    this.GameStrings = []
    this.TriggerStrings = []
    this.Declare = { Presets: {}, Functions: {}, Actions: {}, Events: {} }
    this.Lib = {}
    this.Lib["0"] = new Library(this, undefined)
  }

  QueryFunction(func: string) {
    const fi =
      this.Declare.Functions[func] ||
      this.Declare.Actions[func] ||
      this.Declare.Events[func]
    if (!fi) {
      throw `unknown function ${func}`
    }
    return fi
  }

  Load(asts: AstNodeSection[]) {
    let libid: string = "0"
    asts.forEach(a => {
      switch (a.astType) {
        case "external-preset-def":
          this.Declare.Presets[a.name] = {
            lib: a.lib,
            value: {},
          }
          a.value.forEach(
            v => (this.Declare.Presets[a.name].value[v.name] = v.id)
          )
          break
        case "external-event-def":
          this.Declare.Events[a.func] = {
            id: a.ref.id,
            lib: a.ref.lib,
            param: a.params.map(p => ({
              ...p,
              lib: a.ref.lib
            })),
          }
          break
        case "external-func-def":
          this.Declare.Functions[a.func] = {
            id: a.ref.id,
            lib: a.ref.lib,
            ret: a.ret,
            param: a.params.map(p => ({
              ...p,
              lib: a.ref.lib
            })),
          }
          break
        case "external-act-def":
          this.Declare.Actions[a.func] = {
            id: a.ref.id,
            lib: a.ref.lib,
            param: a.params.map(p => ({
              ...p,
              lib: a.ref.lib
            })),
          }
          break
        case "declare-library":
          libid = a.library
          if (!(libid in this.Lib)) {
            this.Lib[libid] = new Library(this, libid)
            this.TriggerStrings.push(`Library/Name/${libid}=${a.name}`)
          }
          break
        case "trigger-def":
        case "func-def":
        case "act-def":
          this.Lib[libid].Load(a)
          break
      }
    })
  }

  Build() {
    const td = {
      tag: "TriggerData",
      attr: {},
      child: [],
    }
    for (const k in this.Lib) {
      if (k === "0") {
        continue
      }
      td.child.push({
        tag: "Library",
        attr: {
          Id: k,
        },
        child: [...this.Lib[k].Build()],
      })
    }
    if (this.Lib["0"]) {
      td.child.push(...this.Lib["0"].Build())
    }
    return td
  }
}

async function main() {
  const parser = CreateParser()
  const f = await fs.readFile("test.sct")

  let res: AstNodeSection[] = null

  try {
    res = parser.parse(f.toString())
  } catch ([msg]) {
    console.log(msg)
    return
  }

  const prog = new Program()

  prog.Load(res)

  const td = prog.Build()

  await fs.writeFile(
    "C:/Users/nekosu/Desktop/1.SC2Map/Triggers",
    '<?xml version="1.0" encoding="utf-8"?>' + saveXml(td)
  )
  await fs.writeFile(
    "C:/Users/nekosu/Desktop/1.SC2Map/zhCN.SC2Data/LocalizedData/GameStrings.txt",
    `DocInfo/DescLong=完全没有任何描述。
DocInfo/DescShort=任意
DocInfo/Name=这只是另一张《星际争霸II》地图
MapInfo/Player00/Name=中立
MapInfo/Player01/Name=玩家1
MapInfo/Player02/Name=敌对
` + prog.GameStrings.join("\n")
  )
  await fs.writeFile(
    "C:/Users/nekosu/Desktop/1.SC2Map/zhCN.SC2Data/LocalizedData/TriggerStrings.txt",
    prog.TriggerStrings.join("\n")
  )
}

main()
