module.exports = {
  rollup(config) {
    config.external = id => {
      // 更改 tsdx 默认配置，将 uuid 打包进去
      if (id.startsWith('uuid')) {
        return false;
      }

      if (id.startsWith('regenerator-runtime')) {
        return false;
      }

      const external = id => !id.startsWith('.') && !path.isAbsolute(id);

      return external(id);
    };

    return config;
  },
};
