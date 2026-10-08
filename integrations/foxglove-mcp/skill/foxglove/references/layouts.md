# 面板配置

参考本仓库已验证的 integrations/luka-contract-demo/layouts/。
set_layout接受name和data。data的结构：

    {
      "configById": {
        "RawMessages!status": {
          "topicPath": "/imu/data",
          "expansion": "all",
          "diffEnabled": false,
          "diffMethod": "previous message",
          "diffTopicPath": "",
          "showFullMessageForDiff": false,
          "fontSize": 14
        }
      },
      "layout": "RawMessages!status",
      "globalVariables": {},
      "userNodes": {},
      "playbackConfig": {"speed": 1},
      "version": 1
    }

面板ID为类型!唯一后缀。布局树叶子与configById中的ID一一对应；多面板使用{direction:"row"或"column",first,second,splitPercentage}，最多16个面板。支持的类型只有RawMessages、Plot、Image和3D。

- Plot：paths数组，每项value是完整字段路径，enabled=true，timestampMethod="receiveTime"，可指定label/color。xAxisVal="timestamp"。
- RawMessages：topicPath支持话题或子字段，例如/camera/depth/image_raw.header。
- Image：imageMode.imageTopic。例如16UC1深度数据用imageMode.colorMode="colormap"、colorMap="turbo"、minValue=0、maxValue=8000，数值单位为毫米；32FC1要按实际米制范围配置。
- 3D：followTf设为已存在的显示frame；topics键为真实话题、配置visible=true。不修改Nav2自己的TF，也不捏造不存在的机器人模型。
- userNodes必须为空。MCP中没有任意JavaScript、ROS发布或服务调用入口。

布局名称表示展示内容，不代表合同“已完成”；具体能力/缺失项沿用项目manifest和说明。