export type UserRole = 'admin' | 'supervisor' | 'workshop' | 'management' | 'control';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface Vehicle {
  ppu: string;
  model: string;
  contract: string;
  costCenter: string;
  currentMileage: number;
  lastMaintenanceDate: string;
  nextMaintenanceMileage: number;
  nextMaintenanceDate: string;
}

export interface Appointment {
  id: string;
  ppu: string;
  scheduledDate: string;
  mileage: number;
  reason: string;
  status: 'scheduled' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  supervisorUid: string;
  createdAt: string;
}

export interface MaintenanceLog {
  id: string;
  appointmentId: string;
  ppu: string;
  type: 'preventive' | 'corrective';
  entryChecklist: ChecklistData;
  exitChecklist: ChecklistData;
  items: MaintenanceItem[];
  totalHours: number;
  totalCost: number;
  workshopStaff: string[];
  supervisorUid: string;
  completedAt: string;
}

export interface ChecklistData {
  lights: boolean;
  tires: boolean;
  fluids: boolean;
  brakes: boolean;
  bodywork: boolean;
  interior: boolean;
  observations: string;
  signature?: string;
}

export interface MaintenanceItem {
  name: string;
  type?: string;
  quantity: number;
  unit: string;
  cost: number;
}

export interface Project {
  id: string;
  ppu: string;
  name: string;
  startDate: string;
  endDate: string;
  budget: number;
  tasks: ProjectTask[];
  status: 'planning' | 'active' | 'completed';
}

export interface ProjectTask {
  id: string;
  name: string;
  responsible: string;
  startDate: string;
  endDate: string;
  progress: number;
}
