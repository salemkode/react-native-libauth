module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        sourceDir: 'android',
        cxxModuleCMakeListsModuleName: 'libauth_native',
        cxxModuleCMakeListsPath: 'CMakeLists.txt',
        cxxModuleHeaderName: 'LibauthModule',
      },
    },
  },
};
