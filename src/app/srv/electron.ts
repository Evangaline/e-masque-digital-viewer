
//API EXPOSED BY preload.js THROUGH THE CONTEXT BRIDGE
export interface ElectronAPI {
  sendMessage: (message: string) => void;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export function electronAPI(): ElectronAPI {
  return window.electronAPI;
}
