"""Optional Linux/Mesa shader compilation and linking check. No browser dependency.

node --import tsx scripts/shader-fixtures.mts /tmp/blockfront-shaders.json
python scripts/check-shaders.py /tmp/blockfront-shaders.json

Uses the installed libEGL/libGL and a surfaceless OpenGL context. Does not claim
WebGL runtime integration, scene appearance, physical-device FPS or Safari QA.
"""
import ctypes as C
import ctypes.util
import json
import sys


def bind(lib, name, args, result):
    fn = getattr(lib, name)
    fn.argtypes, fn.restype = args, result
    return fn


egl_library, gl_library = ctypes.util.find_library("EGL"), ctypes.util.find_library("GL")
if not egl_library or not gl_library:
    raise RuntimeError("This optional Linux check requires installed libEGL and libGL")
E = C.CDLL(egl_library)
G = C.CDLL(gl_library)
display = bind(E, "eglGetPlatformDisplay", [C.c_uint, C.c_void_p, C.POINTER(C.c_int)], C.c_void_p)(0x31DD, None, None)
major, minor = C.c_int(), C.c_int()
assert bind(E, "eglInitialize", [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)], C.c_uint)(display, C.byref(major), C.byref(minor)), "Cannot initialize surfaceless EGL"
assert bind(E, "eglBindAPI", [C.c_uint], C.c_uint)(0x30A2)
config, count = C.c_void_p(), C.c_int()
assert bind(E, "eglChooseConfig", [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_void_p), C.c_int, C.POINTER(C.c_int)], C.c_uint)(display, (C.c_int * 5)(0x3040, 8, 0x3033, 1, 0x3038), C.byref(config), 1, C.byref(count)) and count.value
context = bind(E, "eglCreateContext", [C.c_void_p, C.c_void_p, C.c_void_p, C.POINTER(C.c_int)], C.c_void_p)(display, config, None, (C.c_int * 5)(0x3098, 4, 0x30FB, 3, 0x3038))
assert context and bind(E, "eglMakeCurrent", [C.c_void_p, C.c_void_p, C.c_void_p, C.c_void_p], C.c_uint)(display, None, None, context), "Cannot create OpenGL context"
get_string = bind(G, "glGetString", [C.c_uint], C.c_char_p)
print(get_string(0x1F01).decode())
create_shader = bind(G, "glCreateShader", [C.c_uint], C.c_uint)
source_shader = bind(G, "glShaderSource", [C.c_uint, C.c_int, C.POINTER(C.c_char_p), C.POINTER(C.c_int)], None)
compile_shader = bind(G, "glCompileShader", [C.c_uint], None)
shader_status = bind(G, "glGetShaderiv", [C.c_uint, C.c_uint, C.POINTER(C.c_int)], None)
shader_log = bind(G, "glGetShaderInfoLog", [C.c_uint, C.c_int, C.POINTER(C.c_int), C.c_char_p], None)
create_program = bind(G, "glCreateProgram", [], C.c_uint)
attach_shader = bind(G, "glAttachShader", [C.c_uint, C.c_uint], None)
link_program = bind(G, "glLinkProgram", [C.c_uint], None)
program_status = bind(G, "glGetProgramiv", [C.c_uint, C.c_uint, C.POINTER(C.c_int)], None)
program_log = bind(G, "glGetProgramInfoLog", [C.c_uint, C.c_int, C.POINTER(C.c_int), C.c_char_p], None)
delete_shader = bind(G, "glDeleteShader", [C.c_uint], None)
delete_program = bind(G, "glDeleteProgram", [C.c_uint], None)

fixtures = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/blockfront-shaders.json"))
for fixture in fixtures:
    program, shaders = create_program(), []
    for stage, kind in [("vertex", 0x8B31), ("fragment", 0x8B30)]:
        shader = create_shader(kind)
        source = C.c_char_p(fixture[stage].encode())
        source_shader(shader, 1, C.byref(source), None)
        compile_shader(shader)
        ok = C.c_int()
        shader_status(shader, 0x8B81, C.byref(ok))
        if not ok.value:
            log = C.create_string_buffer(32768)
            shader_log(shader, len(log), None, log)
            raise RuntimeError(f"{fixture['name']} {stage}:\n{log.value.decode()}")
        attach_shader(program, shader)
        shaders.append(shader)
    link_program(program)
    ok = C.c_int()
    program_status(program, 0x8B82, C.byref(ok))
    if not ok.value:
        log = C.create_string_buffer(32768)
        program_log(program, len(log), None, log)
        raise RuntimeError(f"{fixture['name']} link:\n{log.value.decode()}")
    print(f"PASS {fixture['name']}")
    delete_program(program)
    for shader in shaders:
        delete_shader(shader)
bind(E, "eglMakeCurrent", [C.c_void_p, C.c_void_p, C.c_void_p, C.c_void_p], C.c_uint)(display, None, None, None)
bind(E, "eglDestroyContext", [C.c_void_p, C.c_void_p], C.c_uint)(display, context)
bind(E, "eglTerminate", [C.c_void_p], C.c_uint)(display)
print(f"Compiled and linked {len(fixtures)} GLSL ES 3.0 shader pairs")
