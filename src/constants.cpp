#include "constants.hpp"

#include "js_native_api_types.h"
#include "session/config/contacts.hpp"
#include "session/config/groups/info.hpp"
#include "session/config/user_groups.hpp"
#include "session/pro_backend.h"
#include "session/session_protocol.h"
#include "session/version.h"
#include "utilities.hpp"
#include "version.h"

namespace session::nodeapi {
ConstantsWrapper::ConstantsWrapper(const Napi::CallbackInfo& info) :
        Napi::ObjectWrap<ConstantsWrapper>(info) {}

Napi::Object ConstantsWrapper::Init(Napi::Env env, Napi::Object exports) {
    const char* class_name = "CONSTANTS";

    auto pro_urls = Napi::Object::New(env);
    pro_urls["roadmap"] = toJs(env, SESSION_PROTOCOL_STRINGS.url_pro_roadmap);
    pro_urls["privacy_policy"] = toJs(env, SESSION_PROTOCOL_STRINGS.url_privacy_policy);
    pro_urls["terms_of_service"] = toJs(env, SESSION_PROTOCOL_STRINGS.url_terms_of_service);
    pro_urls["pro_access_not_found"] = toJs(env, SESSION_PROTOCOL_STRINGS.url_pro_access_not_found);
    pro_urls["support_url"] = toJs(env, SESSION_PROTOCOL_STRINGS.url_pro_support);

    auto make_provider = [&](int provider, int other_provider) {
        const auto& meta = SESSION_PRO_BACKEND_PAYMENT_PROVIDER_METADATA[provider];
        auto obj = Napi::Object::New(env);
        obj["device"] = toJs(env, meta.device);
        obj["store"] = toJs(env, meta.store);
        obj["platform"] = toJs(env, meta.platform);
        obj["platform_account"] = toJs(env, meta.platform_account);
        obj["refund_support_url"] = toJs(env, meta.refund_support_url);
        obj["refund_status_url"] = toJs(env, meta.refund_status_url);
        obj["refund_platform_url"] = toJs(env, meta.refund_platform_url);
        obj["update_subscription_url"] = toJs(env, meta.update_subscription_url);
        obj["cancel_subscription_url"] = toJs(env, meta.cancel_subscription_url);
        obj["store_other"] =
                toJs(env, SESSION_PRO_BACKEND_PAYMENT_PROVIDER_METADATA[other_provider].store);
        return obj;
    };

    auto pro_provider_nil = make_provider(
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_NIL, SESSION_PRO_BACKEND_PAYMENT_PROVIDER_NIL);
    auto pro_provider_google = make_provider(
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_GOOGLE_PLAY_STORE,
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_IOS_APP_STORE);
    auto pro_provider_ios = make_provider(
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_IOS_APP_STORE,
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_GOOGLE_PLAY_STORE);

    auto pro_provider_rangeproof = make_provider(
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_RANGEPROOF,
            // Use NIL as the second provider for Rangeproof so that it does not define an alternate
            // store label (i.e., no explicit "other" store for Rangeproof in these constants).
            SESSION_PRO_BACKEND_PAYMENT_PROVIDER_NIL);

    auto pro_providers = Napi::Object::New(env);
    pro_providers["Nil"] = toJs(env, pro_provider_nil);
    pro_providers["Google"] = toJs(env, pro_provider_google);
    pro_providers["iOS"] = toJs(env, pro_provider_ios);
    pro_providers["Rangeproof"] = toJs(env, pro_provider_rangeproof);

    // construct javascript constants object
    Napi::Function cls = DefineClass(
            env,
            class_name,
            {ObjectWrap::StaticValue(
                     "CONTACT_MAX_NAME_LENGTH",
                     Napi::Number::New(env, session::config::contact_info::MAX_NAME_LENGTH),
                     napi_enumerable),
             ObjectWrap::StaticValue(
                     "BASE_GROUP_MAX_NAME_LENGTH",
                     Napi::Number::New(env, session::config::base_group_info::NAME_MAX_LENGTH),
                     napi_enumerable),
             ObjectWrap::StaticValue(
                     "GROUP_INFO_MAX_NAME_LENGTH",
                     Napi::Number::New(env, session::config::groups::Info::NAME_MAX_LENGTH),
                     napi_enumerable),
             ObjectWrap::StaticValue(
                     "GROUP_INFO_DESCRIPTION_MAX_LENGTH",
                     Napi::Number::New(env, session::config::groups::Info::DESCRIPTION_MAX_LENGTH),
                     napi_enumerable),
             ObjectWrap::StaticValue(
                     "COMMUNITY_FULL_URL_MAX_LENGTH",
                     Napi::Number::New(env, session::config::community::FULL_URL_MAX_LENGTH),
                     napi_enumerable),
             ObjectWrap::StaticValue("LIBSESSION_PRO_URLS", pro_urls, napi_enumerable),
             ObjectWrap::StaticValue("LIBSESSION_PRO_PROVIDERS", pro_providers, napi_enumerable),
             ObjectWrap::StaticValue(
                     "LIBSESSION_UTIL_VERSION",
                     Napi::String::New(env, LIBSESSION_UTIL_VERSION_FULL),
                     napi_enumerable),
             ObjectWrap::StaticValue(
                     "LIBSESSION_NODEJS_VERSION",
                     Napi::String::New(env, LIBSESSION_NODEJS_VERSION),
                     napi_enumerable),
             ObjectWrap::StaticValue(
                     "LIBSESSION_NODEJS_COMMIT",
                     Napi::String::New(env, LIBSESSION_NODEJS_COMMIT),
                     napi_enumerable)});

    // export object as javascript module
    exports.Set(class_name, cls);
    return exports;
}

}  // namespace session::nodeapi
