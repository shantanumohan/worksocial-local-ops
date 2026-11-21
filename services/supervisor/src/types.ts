import type {
  HostHealthSnapshot,
  HostLeaseRecord,
  ServiceHeartbeatRecord,
  StorageRootRegistrySnapshot,
  StorageRootValidationError,
} from "@worksocial/persistence";

export type SupervisorCommand =
  | "start"
  | "stop"
  | "recover"
  | "doctor"
  | "diagnostics"
  | "health"
  | "test-local";

export type DoctorCheckStatus = "pass" | "warn" | "fail" | "NOT_RUN";

export type DoctorCheck = {
  id: string;
  status: DoctorCheckStatus;
  message: string;
};

export type DoctorReport = {
  ok: boolean;
  checkedAt: string;
  checks: DoctorCheck[];
  storageRoots: StorageRootRegistrySnapshot;
  health: HostHealthSnapshot;
  productionActivated: false;
};

export type SupervisorResult = {
  ok: boolean;
  command: SupervisorCommand;
  message: string;
  productionActivated: false;
  lease?: HostLeaseRecord | null;
  health?: HostHealthSnapshot;
  doctor?: DoctorReport;
  heartbeats?: ServiceHeartbeatRecord[];
  storageErrors?: StorageRootValidationError[];
  /** Honest wiring notes for slots that are stub / NOT_WIRED. */
  stubs?: string[];
};

export type ManagedProcessInfo = {
  serviceId: "api" | "console" | "temporal-worker";
  pid: number;
  startedAt: string;
  command: string;
  args: string[];
};
