/// <reference path="../shared.d.ts" />

declare module '@klodr/libsession-util-nodejs' {
  export type GroupInfoWrapper = {
    // GroupInfo related methods
    infoGet: () => GroupInfoGet;
    infoSet: (info: GroupInfoSet) => GroupInfoGet;
    infoDestroy: () => void;
  };
}
