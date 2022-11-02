# SC2MapUtil

Generate StarCraft2 triggers' data from our StarCraftTrigger DSL.

从StarCraftTrigger语言生成星际争霸2的触发器数据

```
library "1" "123" {
  folder "枚举和变量" {
    枚举,
    变量1
  },
  folder "目录1" {
    初始化,
    测试,
    测试2
  }
}
```

```
import "Ntve" {

  preset 消息区域 {
    聊天 = 89CC0A21
  }

  [event] fn 游戏_地图初始化 = 00000120 ();

  [func] fn 所有玩家 = 00000192 () -> 玩家组;
  [func] fn 比较 = C439C375 (值1: 任意 = ABB380C4, 运算符: 比较运算符 = 51567265, 值2: 任意 = 4A15EC5F) -> 布尔;

  [action] fn 显示文本 = 0366EE04 (玩家: 玩家组 = 0D120C33, 区域: 消息区域 = A4C19F41, 文本: 文本 = 78A54B52);
  [action] fn 设置变量 = 00000136 (变量: 变量 = 00000219, 值: 任意 = 00000220);
  [action] fn 返回 = 00000097 (值: 任意 = 00000488);

}

library "1" {

  [const] var 变量1 "变量111": 整数 = 2;

  preset 枚举 "测试枚举" {
    项目1,
    项目2
  }

  trigger 初始化 "初始化" 游戏_地图初始化()
    文本 testdoc = 文本"999"
    字符串 test = "12345"
  {
    设置变量 (testdoc, 文本"6789");
    显示文本 (所有玩家(), 消息区域.聊天, testdoc);
    测试2 (1);
  }

  [func] fn 测试 "测试" (a: 整数) -> 布尔
    整数 b = 2
  {
    返回(真);
  }

  [action] fn 测试2 "测试2" (a: 整数)
    整数 b = 2
  {
  }

}
```
