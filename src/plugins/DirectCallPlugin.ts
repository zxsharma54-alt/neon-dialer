import { registerPlugin } from '@capacitor/core';

export interface DirectCallOptions {
  number: string;
}

export interface DirectCallResult {
  success: boolean;
}

export interface PermissionResult {
  granted: boolean;
}

export interface CallWaitingResult {
  started: boolean;
}

export interface DirectCallPluginInterface {
  callNumber(options: DirectCallOptions): Promise<DirectCallResult>;
  openWhatsApp(options: DirectCallOptions): Promise<DirectCallResult>;
  checkPermission(): Promise<PermissionResult>;
  requestPermission(): Promise<PermissionResult>;
  startCallWaitingListener(): Promise<CallWaitingResult>;
  stopCallWaitingListener(): Promise<DirectCallResult>;
}

const DirectCallPlugin = registerPlugin<DirectCallPluginInterface>('DirectCall');

export default DirectCallPlugin;
