import fs from "fs/promises"
import { saveXml, XmlNode } from "./xml.js"
import * as Ast from "./types.js"
import * as TSC from "./tsc-parser.js"
import * as TSD from "./tsd-parser.js"

class XmlNodeList {
  data: XmlNode[]

  constructor() {
    this.data = []
  }

  alloc(tag: string) {
    const el = {
      tag,
      attr: {},
      child: [],
    }
    this.data.push(el)
    return el
  }
}

function tranLib(s: string) {
  return s === "0" ? undefined : s
}

function ref(el: Ast.Element) {
  return {
    Id: el.id,
    Library: tranLib(el.lib),
  }
}

const TypeName = {
  文本: "text",
  字符串: "string",
  整数: "int",
  布尔: "bool",
}

class Context {
  program: Program
  lib: string
  param: Record<string, string>
  variable: Record<string, Ast.Element>
  element: XmlNodeList

  constructor(p: Program) {
    this.program = p
    this.lib = ""
    this.element = new XmlNodeList()
  }

  createType(name: string) {
    return [
      {
        tag: "Type",
        attr: {
          Value: TypeName[name],
        },
        child: [],
      },
    ]
  }

  createParam(val: Ast.Value, def?: Ast.ParamDefine) {
    const el = this.element.alloc("Element")
    el.attr = {
      Type: "Param",
      Id: val.id,
    }
    if (def) {
      el.child.push({
        tag: "ParameterDef",
        attr: {
          Type: "ParamDef",
          ...ref(def),
        },
        child: [],
      })
    }
    switch (val._type) {
      case "direct-value":
        if (["string", "boolean", "int"].includes(val.vtype)) {
          el.child.push({
            tag: "Value",
            attr: {},
            child: [
              {
                tag: "#text",
                attr: {
                  text: val.value.toString(),
                },
                child: [],
              },
            ],
          })
        }
        el.child.push({
          tag: "ValueType",
          attr: {
            Type: val.vtype,
          },
          child: [],
        })
        break
      case "var-refer":
        el.child.push({
          tag: "Variable",
          attr: {
            Type: "Variable",
            ...ref(this.variable[val.name])
          },
          child: [],
        })
        break
      case "preset-value": {
        const pl = this.program.preset[val.preset].item.find(
          item => item.name === val.item
        )
        el.child.push({
          tag: "Preset",
          attr: {
            Type: "PresetValue",
            ...ref(pl),
          },
          child: [],
        })
        break
      }
      case "call-value":
        el.child.push({
          tag: "FunctionCall",
          attr: {
            Type: "FunctionCall",
            ...ref(val.call)
          },
          child: [],
        })
        this.createFunctionCall(val.call)
        break
    }
  }

  createVariableDef(vd: Ast.VariableDefine) {
    const el = this.element.alloc("Element")
    el.attr = {
      Type: "Variable",
      Id: vd.id,
    }
    el.child.push({
      tag: "VariableType",
      attr: {},
      child: [...this.createType(vd.type)],
    })
    el.child.push({
      tag: "Value",
      attr: {
        Type: "Param",
        ...ref(vd.value),
      },
      child: [],
    })
    this.createParam(vd.value)
  }

  createParamDef(pd: Ast.ParamDefine) {
    const el = this.element.alloc("Element")
    el.attr = {
      Type: "ParamDef",
      Id: pd.id,
    }
    el.child.push({
      tag: "ParameterType",
      attr: {},
      child: [...this.createType(pd.type)],
    })
  }

  createFunctionCall(fc: Ast.FunctionCall) {
    const el = this.element.alloc("Element")
    el.attr = {
      Type: "FunctionCall",
      Id: fc.id,
    }
    const fi = this.program.function[fc.func]
    el.child.push({
      tag: "FunctionDef",
      attr: {
        Type: "FunctionDef",
        ...ref(fi),
      },
      child: [],
    })
    fc.param.forEach((p, i) => {
      el.child.push({
        tag: "Parameter",
        attr: {
          Type: "Param",
          ...ref(p),
        },
        child: [],
      })
      this.createParam(p, fi.params[i])
    })
  }

  buildItem(item: Ast.DFolder | string) {
    if (typeof item === "string") {
      this.variable = {}
      if (item in this.program.trigger) {
        const obj = this.program.trigger[item]
        const el = this.element.alloc("Element")
        el.attr = {
          Type: "Trigger",
          Id: obj.id,
        }
        el.child.push({
          tag: "Event",
          attr: {
            Type: "FunctionCall",
            ...ref(obj.event),
          },
          child: [],
        })
        this.createFunctionCall(obj.event)
        obj.vars.forEach(v => {
          this.variable[v.name] = v
          el.child.push({
            tag: "Variable",
            attr: {
              Type: "Variable",
              ...ref(v),
            },
            child: [],
          })
          this.createVariableDef(v)
        })
        obj.prog.forEach(p => {
          el.child.push({
            tag: "Action",
            attr: {
              Type: "FunctionCall",
              ...ref(p),
            },
            child: [],
          })
          this.createFunctionCall(p)
        })
        return {
          tag: "Item",
          attr: {
            Type: "Trigger",
            ...ref(obj),
          },
          child: [],
        }
      } else if (item in this.program.function) {
        const obj = this.program.function[item] as Ast.FunctionDefine
        const el = this.element.alloc("Element")
        el.attr = {
          Type: "FunctionDef",
          Id: obj.id,
        }
        if (obj.flag.findIndex(a => a.key === "func") !== -1) {
          el.child.push({
            tag: "FlagCall",
            attr: {},
            child: [],
          })
        } else if (obj.flag.findIndex(a => a.key === "action") !== -1) {
          el.child.push({
            tag: "FlagAction",
            attr: {},
            child: [],
          })
        }
        if (obj.ret !== "void") {
          el.child.push({
            tag: "ReturnType",
            attr: {},
            child: [...this.createType(obj.ret)],
          })
        }
        obj.params.forEach(p => {
          this.variable[p.name] = p
          el.child.push({
            tag: "Parameter",
            attr: {
              Type: "ParamDef",
              ...ref(p),
            },
            child: [],
          })
          this.createParamDef(p)
        })
        obj.vars.forEach(v => {
          this.variable[v.name] = v
          el.child.push({
            tag: "Variable",
            attr: {
              Type: "Variable",
              ...ref(v),
            },
            child: [],
          })
          this.createVariableDef(v)
        })
        obj.prog.forEach(p => {
          el.child.push({
            tag: "FunctionCall",
            attr: {
              Type: "FunctionCall",
              ...ref(p),
            },
            child: [],
          })
          this.createFunctionCall(p)
        })
        return {
          tag: "Item",
          attr: {
            Type: "FunctionDef",
            ...ref(obj),
          },
          child: [],
        }
      } else if (item in this.program.preset) {
        const obj = this.program.preset[item]
        const el = this.element.alloc("Element")
        el.attr = {
          Type: "Preset",
          Id: obj.id,
        }
        el.child.push(
          {
            tag: "PresetInteger",
            attr: {},
            child: [],
          },
          {
            tag: "BaseType",
            attr: {
              Value: "int",
            },
            child: [],
          },
          {
            tag: "PresetGenConstVar",
            attr: {},
            child: [],
          }
        )
        obj.item.forEach(it => {
          el.child.push({
            tag: "Item",
            attr: {
              Type: "PresetValue",
              ...ref(it),
            },
            child: [],
          })
          const e = this.element.alloc("Element")
          e.attr = {
            Type: "PresetValue",
            Id: it.id,
          }
        })
        return {
          tag: "Item",
          attr: {
            Type: "Preset",
            ...ref(obj),
          },
          child: [],
        }
      }
    } else {
      const el = this.element.alloc("Element")
      el.attr = {
        Type: "Category",
        Id: item.id,
      }
      el.child = item.item.map(it => this.buildItem(it))
      return {
        tag: "Item",
        attr: {
          Type: "Category",
          Libraray: tranLib(this.lib),
          Id: item.id,
        },
        child: [],
      }
    }
  }

  build(lib: Ast.DLibrary) {
    this.lib = lib.name
    const root = this.element.alloc("Root")
    lib.item.forEach(it => {
      root.child.push(this.buildItem(it))
    })
  }
}

export class Program {
  GS: string[]
  TS: string[]
  ID: Record<string, number>

  preset: Record<string, Ast.PresetInfo>
  function: Record<string, Ast.FunctionInfo>
  trigger: Record<string, Ast.TriggerDefine>

  constructor() {
    this.GS = [
      "DocInfo/DescLong=完全没有任何描述。",
      "DocInfo/DescShort=任意",
      "DocInfo/Name=这只是另一张《星际争霸II》地图",
      "MapInfo/Player00/Name=中立",
      "MapInfo/Player01/Name=玩家1",
      "MapInfo/Player02/Name=敌对",
    ]
    this.TS = []
    this.ID = {}
    this.trigger = {}
    this.preset = {}
    this.function = {}
  }

  gen(lib: string) {
    if (!(lib in this.ID)) {
      this.ID[lib] = 0x10000000
    }
    return (++this.ID[lib]).toString(16).toUpperCase().padStart(8)
  }

  put(type: string, text: string) {
    switch (type) {
      case "gs":
        this.GS.push(text)
        break
      case "ts":
        this.TS.push(text)
        break
    }
  }

  async load(sct_path: string) {
    console.log(`Loading ${sct_path}`)

    const buf = (await fs.readFile(sct_path)).toString()
    let p: Ast.Program = null
    try {
      p = TSC.CreateParser().parse(buf)
    } catch ([msg]) {
      throw msg
    }
    console.log(`Parse done`)
    TSC.GenerateId(
      p,
      (lib: string) => {
        return this.gen(lib)
      },
      (type, text) => {
        this.put(type, text)
      }
    )
    p.forEach(scope => {
      switch (scope._type) {
        case "import":
          scope.define.forEach(d => {
            switch (d._type) {
              case "ext-func-def":
                this.function[d.name] = d
                break
              case "ext-preset-def":
                this.preset[d.name] = d
                break
            }
          })
          break
        case "library":
          scope.define.forEach(d => {
            switch (d._type) {
              case "trigger-def":
                this.trigger[d.name] = d
                break
              case "func-def":
                this.function[d.name] = d
                break
              case "preset-def":
                this.preset[d.name] = d
                break
            }
          })
          break
      }
    })
  }

  async generate(scd_path: string) {
    const buf = (await fs.readFile(scd_path)).toString()
    let libs: Ast.DLibrary[] = []
    try {
      libs = TSD.CreateParser().parse(buf)
    } catch ([msg]) {
      throw msg
    }
    TSD.GenerateId(
      libs,
      (lib: string) => {
        return this.gen(lib)
      },
      (type, text) => {
        this.put(type, text)
      }
    )

    const result = {
      tag: "TriggerData",
      attr: {},
      child: [],
    }

    libs.forEach(lib => {
      const ctx = new Context(this)
      ctx.build(lib)
      if (lib.name === "0") {
        result.child.push(...ctx.element.data)
      } else {
        result.child.push({
          tag: "Library",
          attr: {
            Id: lib.name,
          },
          child: ctx.element.data,
        })
      }
    })

    const dir = "C:/Users/nekosu/Desktop/1.SC2Map"
    const locale = "zhCN.SC2Data"

    await fs.writeFile(`${dir}/Triggers`, saveXml(result))
    await fs.writeFile(`${dir}/${locale}/LocalizedData/GameStrings.txt`, this.GS.join("\n"))
    await fs.writeFile(`${dir}/${locale}/LocalizedData/TriggerStrings.txt`, this.TS.join("\n"))
  }
}
