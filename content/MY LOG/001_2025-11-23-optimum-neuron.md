---
title: "2025.11.23 | Some notes on exporting neuron models with Optimum-Neuron"
---

# Some notes on exporting neuron models with Optimum-Neuron

## 问题背景

在使用 Optimum-Neuron 导出模型时，遇到了一个关键问题：`NeuronModelForCausalLM.from_pretrained` 方法会忽略传入的参数。

## 错误示例

当你尝试这样调用时：

```python
from optimum.neuron import NeuronModelForCausalLM

model = NeuronModelForCausalLM.from_pretrained(
    model_id,
    tensor_parallel_size=2,  # 这个参数会被忽略！
    batch_size=1,
    sequence_length=2048,
)
```

会报错：

```
OSError: ... does not appear to have a file named neuron_config.json.
```

## 代码解释

问题出在 `_from_pretrained` 方法中：

```python
def _from_pretrained(
    cls,
    model_id: "str | Path",
    # ...
) -> NeuronPreTrainedModel:
    if len(kwargs) > 0:
        # 这里忽略了你传入的 tensor_parallel_size 等参数
        logger.warning("Ignoring the following kwargs...")
    
    # 这一行强行调用 .from_pretrained(model_id)
    # 它不再看你传入的参数，而是通过 model_id 去找"已存在"的配置
    neuron_config = NxDNeuronConfig.from_pretrained(model_id)
```

## 正确做法

必须使用 `get_neuron_config` 方法：

```python
from optimum.neuron import NeuronModelForCausalLM

# 先获取配置
neuron_config = NeuronModelForCausalLM.get_neuron_config(
    model_name_or_path=model_id,
    batch_size=1,
    sequence_length=2048,
    tensor_parallel_size=2,
)

# 然后用配置导出模型
model = NeuronModelForCausalLM.from_pretrained(
    model_id,
    neuron_config=neuron_config,
)
```

## 总结

- `from_pretrained`：是"加载器"，假设配置文件已经存在
- `get_neuron_config`：是"构建器"，根据你的参数现场生成配置
