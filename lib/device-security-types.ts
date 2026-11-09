export type RecognizedDevice = {
  id: string; installationId: string; fingerprintId: string; riskScore: number; trustStatus: string;
  firstSeenAt: number; lastSeenAt: number;
  metadata: { deviceType?: string; osName?: string; osVersion?: string; browserName?: string; browserVersion?: string;
    telegramPlatform?: string; telegramApiVersion?: string; fingerprintStatus?: string; storageSource?: string; timezone?: string; screenResolution?: string };
};
export type RecognitionSession = {
  id: string; deviceId: string; firstSeenAt: number; lastSeenAt: number; riskScore: number; riskReasons: string[];
  reportedIp: string; ipSource: string; locationCheckedAt?: number | null; locationAccuracy?: number | null; locationSource?: string;
};
export type DeviceSecurityData = {
  devices: RecognizedDevice[]; sessions: RecognitionSession[];
  events: Array<{ id: string; deviceId: string; eventType: string; createdAt: number }>;
  retentionDays: number; preciseCoordinatesStored: boolean; serverIpAvailable: boolean;
  sharedAccounts?: Array<{ customerId: string; name?: string; username?: string; memberId?: string }>;
};
