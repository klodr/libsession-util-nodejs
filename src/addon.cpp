#include <napi.h>

#include <oxen/log.hpp>

#include "blinding/blinding.hpp"
#include "constants.hpp"
#include "contacts_config.hpp"
#include "convo_info_volatile_config.hpp"
#include "encrypt_decrypt/encrypt_decrypt.hpp"
#include "groups/meta_group_wrapper.hpp"
#include "pro/pro.hpp"
#include "user_config.hpp"
#include "user_groups_config.hpp"

Napi::ThreadSafeFunction tsfn;

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {

    tsfn = Napi::ThreadSafeFunction::New(
            env,
            Napi::Function::New(env, [](const Napi::CallbackInfo& info) {}),
            "LoggerCallback",
            0,
            1);
    // Logger callback is fire-and-forget — it must not keep the Node
    // event loop alive on its own. Without this Unref, a CLI that
    // does `require('@klodr/libsession-util-nodejs')` hangs forever
    // because the TSFN holds a ref on the loop even with no work.
    tsfn.Unref(env);

    // Release the TSFN when the N-API environment tears down (worker
    // shutdown, vm context reload, process exit on graceful paths).
    // Without this, a later libsession log from a background thread
    // could BlockingCall into a destroyed env -> abort/UAF, and
    // repeated module loads stack duplicate logger callbacks.
    napi_add_env_cleanup_hook(
            env,
            [](void*) {
                if (tsfn) {
                    tsfn.Release();
                    tsfn = nullptr;
                }
            },
            nullptr);

    session::add_logger([](std::string_view msg) {
        // If the TSFN was already released by the env-cleanup hook
        // (env teardown raced with a background log emission), skip
        // the BlockingCall — calling on a released TSFN aborts.
        if (!tsfn)
            return;
        tsfn.BlockingCall(
                new std::string(msg),
                [](Napi::Env env, Napi::Function jsCallback, std::string* msg) {
                    Napi::HandleScope scope(env);
                    Napi::Function consoleLog = env.Global()
                                                        .Get("console")
                                                        .As<Napi::Object>()
                                                        .Get("log")
                                                        .As<Napi::Function>();
                    Napi::String jsStr = Napi::String::New(env, "libsession: " + *msg);
                    consoleLog.Call({jsStr});
                    delete msg;
                });
    });
    oxen::log::set_level_default(oxen::log::Level::info);

    session::nodeapi::ConstantsWrapper::Init(env, exports);

    // Group wrappers init
    session::nodeapi::MetaGroupWrapper::Init(env, exports);

    // User wrappers init
    session::nodeapi::UserConfigWrapper::Init(env, exports);
    session::nodeapi::ContactsConfigWrapper::Init(env, exports);
    session::nodeapi::UserGroupsWrapper::Init(env, exports);
    session::nodeapi::ConvoInfoVolatileWrapper::Init(env, exports);

    // Fully static wrappers init
    session::nodeapi::MultiEncryptWrapper::Init(env, exports);
    session::nodeapi::ProWrapper::Init(env, exports);
    session::nodeapi::BlindingWrapper::Init(env, exports);

    return exports;
}

NODE_API_MODULE(libsession_util_nodejs, InitAll);
