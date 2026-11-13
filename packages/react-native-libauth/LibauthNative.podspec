require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'LibauthNative'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://github.com/salemkode/react-native-libauth'
  s.license = 'MIT'
  s.author = 'Libauth Native contributors'
  s.source = { :git => 'https://github.com/salemkode/react-native-libauth.git', :tag => s.version }
  s.platforms = { :ios => min_ios_version_supported }
  s.source_files = 'native/host/**/*.{h,hpp,c,cpp}'
  # Polygen owns the runtime implementation; share it with all five modules.
  s.exclude_files = 'native/host/wasm-rt/*.c'
  s.header_mappings_dir = 'native/host'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/native/host/wasm-rt"'
  }
  s.dependency 'ReactNativePolygen'
  install_modules_dependencies(s)
end
