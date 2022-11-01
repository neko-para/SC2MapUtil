import { SimpleParser } from "../parser.js"
import * as Ast from "./types.js"

interface NodeTypes {
  $preset: null
  $fn: null
  $trigger: null
  $library: null
  $import: null
  "$->": null
  "$;": null
  "$.": null
  "$,": null
  "${": null
  "$}": null
  "$[": null
  "$]": null
  "$(": null
  "$)": null
  "$<": null
  "$>": null
  "$:": null
  "$=": null
  $id: string
  $text: string
  $str: string
  $int: number
  $boolean: boolean
  $label: string

  Program: Ast.Program
  Section: Ast.Scope

  Value: Ast.Value
  Values: Ast.Value[]

  Call: Ast.FunctionCall

  Statement: Ast.FunctionCall
  Statements: Ast.FunctionCall[]

  LibraryScope: Ast.LibraryScope
  LibraryContent: Ast.TriggerDefine | Ast.FunctionDefine | Ast.PresetDefine
  LibraryContents: (Ast.TriggerDefine | Ast.FunctionDefine | Ast.PresetDefine)[]

  ImportScope: Ast.ImportScope
  ImportContent: Ast.ExternalPresetDefine | Ast.ExternalFunctionDefine
  ImportContents: (Ast.ExternalPresetDefine | Ast.ExternalFunctionDefine)[]

  Attribute: Ast.Attribute
  AttributeItem: Ast.AttributeItem
  AttributeItems: Ast.AttributeItem[]

  ReturnType: string

  VariableDef: Ast.VariableDefine
  VariableDefs: Ast.VariableDefine[]
  ParamDef: Ast.ParamDefine
  ParamDefs: Ast.ParamDefine[]
  PresetValueDef: Ast.PresetItem
  PresetValueDefs: Ast.PresetItem[]
  TriggerDef: Ast.TriggerDefine
  FunctionDef: Ast.FunctionDefine
  PresetDef: Ast.PresetDefine

  ExternalParamDef: Ast.ParamDefine
  ExternalParamDefs: Ast.ParamDefine[]
  ExternalPresetValueDef: Ast.PresetItem
  ExternalPresetValueDefs: Ast.PresetItem[]
  ExternalFunctionDef: Ast.ExternalFunctionDefine
  ExternalPresetDef: Ast.ExternalPresetDefine
}

export function CreateParser() {
  const parser = new SimpleParser<NodeTypes>(
    /[ \n\r\t]+/,
    {
      $id: /[0-9a-fA-F]{8}/,
      $text: /文本"[\s\S]+?"/,
      $str: /"[\s\S]+?"/,
      $int: /-?\d+/,
      $boolean: /[真假]/,
      $label:
        /[\p{Unified_Ideograph}a-zA-Z_][\p{Unified_Ideograph}a-zA-Z0-9_]*/u,
    },
    {
      $id: s => s.toUpperCase(),
      $text: s => s.substring(3, s.length - 1),
      $str: s => s.substring(1, s.length - 1),
      $int: parseInt,
      $boolean: b => b === "真",
    },
    [
      "$preset",
      "$fn",
      "$trigger",
      "$library",
      "$import",
      "$->",
      "$;",
      "$.",
      "$,",
      "${",
      "$}",
      "$[",
      "$]",
      "$(",
      "$)",
      "$<",
      "$>",
      "$:",
      "$=",
    ]
  )

  parser.rule
    .entry("Program")
    .with(r => r._some("Program", "Section"))
    .for("Section")
    .sameas("ImportScope")
    .sameas("LibraryScope")

    .with(r => r._some_sep("Values", "Value", "$,"))
    .for("Value")
    .when("$text")
    .do(value => ({
      _type: "direct-value",
      vtype: "text",
      value,
    }))
    .when("$str")
    .do(value => ({
      _type: "direct-value",
      vtype: "string",
      value,
    }))
    .when("$int")
    .do(value => ({
      _type: "direct-value",
      vtype: "int",
      value,
    }))
    .when("$boolean")
    .do(value => ({
      _type: "direct-value",
      vtype: "boolean",
      value,
    }))
    .when("$label", "$.", "$label")
    .do((preset, _, item) => ({
      _type: "preset-value",
      preset,
      item,
    }))
    .when("$label")
    .do(name => ({
      _type: "var-refer",
      name,
    }))
    .when("Call")
    .do(call => ({
      _type: 'call-value',
      call
    }))

    .for("Call")
    .when("$label", "$(", "Values", "$)")
    .do((func, _, param) => ({
      _type: "call",
      func,
      param,
    }))

    .with(r => r._some("Statements", "Statement"))
    .for("Statement")
    .when("Call", "$;")
    .do(x => x)

    .for("LibraryScope")
    .when("$library", "$str", "${", "LibraryContents", "$}")
    .do((_, library, _2, define) => ({
      _type: "library",
      library,
      define,
    }))
    .with(r => r._some("LibraryContents", "LibraryContent"))
    .for("LibraryContent")
    .sameas("TriggerDef")
    .sameas("FunctionDef")
    .sameas("PresetDef")

    .for("ImportScope")
    .when("$import", "$str", "${", "ImportContents", "$}")
    .do((_, library, _2, define) => ({
      _type: "import",
      library,
      define,
    }))
    .with(r => r._some("ImportContents", "ImportContent"))
    .for("ImportContent")
    .sameas("ExternalPresetDef")
    .sameas("ExternalFunctionDef")

    .for("Attribute")
    .when("$[", "AttributeItems", "$]")
    .do((_, x) => x)
    .with(r => r._some_sep("AttributeItems", "AttributeItem", "$,"))
    .for("AttributeItem")
    .when("$label")
    .do(key => ({
      key,
    }))
    .when("$label", "$=", "$str")
    .do((key, _, value) => ({
      key,
      value,
    }))

    .for("ReturnType")
    .when()
    .do(() => "void")
    .when("$->", "$label")
    .do((_, r) => r)

    .with(r => r._some("VariableDefs", "VariableDef"))
    .for("VariableDef")
    .when("$label", "$label", "$=", "Value")
    .do((type, name, _, value) => ({
      type,
      name,
      value,
    }))

    .with(r => r._some_sep("ParamDefs", "ParamDef", "$,"))
    .for("ParamDef")
    .when("$label", "$:", "$label")
    .do((name, _, type) => ({
      type,
      name,
    }))

    .with(r => r._some_sep("PresetValueDefs", "PresetValueDef", "$,"))
    .for("PresetValueDef")
    .when("$label")
    .do(name => ({
      name,
    }))

    .for("TriggerDef")
    .when(
      "Attribute",
      "$trigger",
      "$label",
      "$str",
      "Call",
      "VariableDefs",
      "${",
      "Statements",
      "$}"
    )
    .do((flag, _, name, desc, event, vars, _2, prog) => ({
      _type: "trigger-def",
      flag,
      name,
      desc,
      event,
      vars,
      prog,
    }))

    .for("FunctionDef")
    .when(
      "Attribute",
      "$fn",
      "$label",
      "$str",
      "$(",
      "ParamDefs",
      "$)",
      "ReturnType",
      "VariableDefs",
      "${",
      "Statements",
      "$}"
    )
    .do((flag, _, name, desc, _2, params, _3, ret, vars, _4, prog) => ({
      _type: "func-def",
      flag,
      name,
      desc,
      params,
      ret,
      vars,
      prog,
    }))

    .for("PresetDef")
    .when(
      "Attribute",
      "$preset",
      "$label",
      "$str",
      "${",
      "PresetValueDefs",
      "$}"
    )
    .do((flag, _, name, desc, _2, item) => ({
      _type: "preset-def",
      name,
      desc,
      flag,
      item,
    }))

    .with(r => r._some_sep("ExternalParamDefs", "ExternalParamDef", "$,"))
    .for("ExternalParamDef")
    .when("$label", "$:", "$label", "$=", "$id")
    .do((name, _, type, _2, id) => ({
      id,
      name,
      type,
    }))

    .with(r =>
      r._some_sep("ExternalPresetValueDefs", "ExternalPresetValueDef", "$,")
    )
    .for("ExternalPresetValueDef")
    .when("$label", "$=", "$id")
    .do((name, _, id) => ({
      id,
      name,
    }))

    .for("ExternalFunctionDef")
    .when(
      "Attribute",
      "$fn",
      "$label",
      "$=",
      "$id",
      "$(",
      "ExternalParamDefs",
      "$)",
      "ReturnType",
      "$;"
    )
    .do((flag, _, name, _2, id, _3, params, _4, ret) => ({
      _type: "ext-func-def",
      id,
      flag,
      name,
      desc: name,
      ret,
      params,
    }))

    .for("ExternalPresetDef")
    .when(
      "Attribute",
      "$preset",
      "$label",
      "${",
      "ExternalPresetValueDefs",
      "$}"
    )
    .do((flag, _, name, _2, item) => ({
      _type: "ext-preset-def",
      name,
      desc: name,
      flag,
      item,
    }))

  return parser
}

function TraceIntoValue(
  val: Ast.Value | Ast.FunctionCall,
  lib: string,
  gen: (lib: string) => string,
  put: (type: "ts" | "gs", text: string) => void
) {
  val.id = gen(lib)
  val.lib = lib
  switch (val._type) {
    case "direct-value":
      switch (val.vtype) {
        case "text":
          put(
            "gs",
            `Param/Value/${lib === "0" ? "" : `lib_${lib}_`}${val.id}=${
              val.value
            }`
          )
          break
      }
      break
    case 'call':
      val.param.forEach(p => {
        TraceIntoValue(p, lib, gen, put)
      })
      break
    case "call-value":
      TraceIntoValue(val.call, lib, gen, put)
      break
  }
}

export function GenerateId(
  prog: Ast.Program,
  gen: (lib: string) => string,
  put: (type: "ts" | "gs", text: string) => void
) {
  prog.forEach(p => {
    switch (p._type) {
      case "import":
        p.define.forEach(d => {
          d.lib = p.library
          switch (d._type) {
            case "ext-func-def":
              d.params.forEach(pr => {
                pr.lib = p.library
              })
              break
            case "ext-preset-def":
              d.item.forEach(it => {
                it.lib = p.library
              })
              break
          }
        })
        break
      case "library":
        p.define.forEach(d => {
          d.id = gen(p.library)
          d.lib = p.library
          const libprefix = p.library === "0" ? "" : `lib_${p.library}_`
          switch (d._type) {
            case "preset-def":
              put("ts", `Preset/Name/${libprefix}${d.id}=${d.desc}`)
              d.item.forEach(it => {
                it.id = gen(p.library)
                it.lib = p.library
                put("ts", `PresetValue/Name/${libprefix}${it.id}=${it.name}`)
              })
              break
            case "trigger-def":
              put("ts", `Trigger/Name/${libprefix}${d.id}=${d.desc}`)
              TraceIntoValue(d.event, p.library, gen, put)
              d.vars.forEach(v => {
                v.id = gen(p.library)
                v.lib = p.library
                put("ts", `Variable/Name/${libprefix}${v.id}=${v.name}`)
                TraceIntoValue(v.value, p.library, gen, put)
              })
              d.prog.forEach(pr => {
                TraceIntoValue(pr, p.library, gen, put)
              })
              break
            case "func-def":
              put("ts", `FunctionDef/Name/${libprefix}${d.id}=${d.desc}`)
              d.params.forEach(pr => {
                pr.id = gen(p.library)
                pr.lib = p.library
                put("ts", `ParamDef/Name/${libprefix}${pr.id}=${pr.name}`)
              })
              d.vars.forEach(v => {
                v.id = gen(p.library)
                v.lib = p.library
                put("ts", `Variable/Name/${libprefix}${v.id}=${v.name}`)
                TraceIntoValue(v.value, p.library, gen, put)
              })
              d.prog.forEach(pr => {
                TraceIntoValue(pr, p.library, gen, put)
              })
              break
          }
        })
    }
  })
  return prog
}
