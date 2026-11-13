cmake_minimum_required(VERSION 3.22.1)
project(libauth_native LANGUAGES C CXX)

set(LIBAUTH_HOST "${CMAKE_CURRENT_SOURCE_DIR}/../native/host")
file(GLOB_RECURSE LIBAUTH_SOURCES CONFIGURE_DEPENDS "${LIBAUTH_HOST}/*.cpp" "${LIBAUTH_HOST}/*.c")
# The Polygen runtime provides wasm-rt once for the whole process.
list(FILTER LIBAUTH_SOURCES EXCLUDE REGEX "/wasm-rt/")
add_library(libauth_native STATIC ${LIBAUTH_SOURCES})
set_target_properties(libauth_native PROPERTIES CXX_STANDARD 20 POSITION_INDEPENDENT_CODE ON)
target_include_directories(libauth_native PUBLIC "${LIBAUTH_HOST}" "${LIBAUTH_HOST}/wasm-rt" "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(libauth_native libauth_polygen jsi reactnative)
