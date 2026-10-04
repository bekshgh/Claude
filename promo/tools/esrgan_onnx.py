"""Convert a Real-ESRGAN RRDBNet .pth checkpoint to ONNX without PyTorch."""
import collections
import pickle
import sys
import zipfile

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


def load_pth(path):
    z = zipfile.ZipFile(path)
    prefix = z.namelist()[0].split('/')[0]
    dtypes = {'FloatStorage': np.float32, 'HalfStorage': np.float16,
              'LongStorage': np.int64, 'IntStorage': np.int32, 'DoubleStorage': np.float64}

    def rebuild(storage, offset, size, stride, *args):
        if len(size) == 0:
            return storage[offset:offset + 1].reshape(())
        arr = np.lib.stride_tricks.as_strided(
            storage[offset:], shape=tuple(size), strides=[s * storage.itemsize for s in stride])
        return np.array(arr)

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            if mod == 'torch._utils' and name == '_rebuild_tensor_v2':
                return rebuild
            if mod == 'torch' and name.endswith('Storage'):
                return name
            if mod == 'collections' and name == 'OrderedDict':
                return collections.OrderedDict
            return super().find_class(mod, name)

        def persistent_load(self, pid):
            _, stype, key, _loc, _numel = pid
            return np.frombuffer(z.read(f'{prefix}/data/{key}'), dtype=dtypes[stype])

    return U(z.open(f'{prefix}/data.pkl')).load()


def build(sd, num_block):
    nodes, inits = [], []
    cnt = [0]

    def nm(p):
        cnt[0] += 1
        return f'{p}_{cnt[0]}'

    def conv(x, key):
        w, b = sd[key + '.weight'].astype(np.float32), sd[key + '.bias'].astype(np.float32)
        wn, bn = key + '.weight', key + '.bias'
        inits.append(numpy_helper.from_array(w, wn))
        inits.append(numpy_helper.from_array(b, bn))
        y = nm('conv')
        nodes.append(helper.make_node('Conv', [x, wn, bn], [y], pads=[1, 1, 1, 1], kernel_shape=[3, 3]))
        return y

    def lrelu(x):
        y = nm('lrelu')
        nodes.append(helper.make_node('LeakyRelu', [x], [y], alpha=0.2))
        return y

    def cat(xs):
        y = nm('cat')
        nodes.append(helper.make_node('Concat', xs, [y], axis=1))
        return y

    inits.append(numpy_helper.from_array(np.array(0.2, np.float32), 'k02'))

    def scale_add(a, b):
        m = nm('mul')
        nodes.append(helper.make_node('Mul', [a, 'k02'], [m]))
        y = nm('add')
        nodes.append(helper.make_node('Add', [m, b], [y]))
        return y

    def rdb(x, p):
        x1 = lrelu(conv(x, p + '.conv1'))
        x2 = lrelu(conv(cat([x, x1]), p + '.conv2'))
        x3 = lrelu(conv(cat([x, x1, x2]), p + '.conv3'))
        x4 = lrelu(conv(cat([x, x1, x2, x3]), p + '.conv4'))
        x5 = conv(cat([x, x1, x2, x3, x4]), p + '.conv5')
        return scale_add(x5, x)

    inits.append(numpy_helper.from_array(np.array([1, 1, 2, 2], np.float32), 'up_scales'))

    def up(x):
        y = nm('up')
        nodes.append(helper.make_node('Resize', [x, '', 'up_scales'], [y], mode='nearest',
                                      coordinate_transformation_mode='asymmetric', nearest_mode='floor'))
        return y

    feat = conv('input', 'conv_first')
    h = feat
    for i in range(num_block):
        o = rdb(h, f'body.{i}.rdb1')
        o = rdb(o, f'body.{i}.rdb2')
        o = rdb(o, f'body.{i}.rdb3')
        h = scale_add(o, h)
    body = conv(h, 'conv_body')
    s = nm('add')
    nodes.append(helper.make_node('Add', [feat, body], [s]))
    f = lrelu(conv(up(s), 'conv_up1'))
    f = lrelu(conv(up(f), 'conv_up2'))
    out = conv(lrelu(conv(f, 'conv_hr')), 'conv_last')
    nodes.append(helper.make_node('Identity', [out], ['output']))
    g = helper.make_graph(nodes, 'rrdbnet',
                          [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])],
                          [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])],
                          inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)])
    m.ir_version = 8
    return m


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    ck = load_pth(src)
    sd = ck.get('params_ema', ck.get('params', ck))
    nb = 1 + max(int(k.split('.')[1]) for k in sd if k.startswith('body.'))
    print('blocks', nb, 'tensors', len(sd))
    model = build(sd, nb)
    onnx.checker.check_model(model)
    onnx.save(model, dst)
    print('saved', dst)
