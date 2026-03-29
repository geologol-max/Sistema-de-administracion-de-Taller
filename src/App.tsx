import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  ClipboardCheck, 
  FileText, 
  Truck, 
  Users, 
  Settings, 
  LogOut, 
  Plus, 
  Search, 
  Clock, 
  DollarSign, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Menu, 
  X, 
  ChevronRight, 
  Moon, 
  Sun, 
  Download, 
  GanttChartSquare, 
  Wrench, 
  Package, 
  UserCheck,
  Trash2
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  Timestamp, 
  getDoc, 
  setDoc, 
  getDocs 
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, addDays, isAfter, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, auth } from './firebase';
import { 
  UserProfile, 
  Vehicle, 
  Appointment, 
  MaintenanceLog, 
  Project, 
  UserRole, 
  ChecklistData, 
  MaintenanceItem 
} from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const generatePDF = (type: 'checklist' | 'report' | 'supplies', data: any, apt?: Appointment) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('FleetMaster System', 15, 25);
  doc.setFontSize(10);
  const subtitle = type === 'checklist' ? 'Checklist de Ingreso' : type === 'report' ? 'Informe Final de Servicio' : 'Solicitud de Insumos';
  doc.text(subtitle, 15, 32);
  
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(12);
  doc.text('Información General', 15, 50);
  doc.line(15, 52, 195, 52);
  
  doc.setFontSize(10);
  const ppu = apt?.ppu || data.ppu || 'N/A';
  doc.text(`PPU: ${ppu}`, 15, 60);
  if (apt) {
    doc.text(`Kilometraje: ${apt.mileage} km`, 15, 65);
    doc.text(`Contrato: ${apt.contract}`, 15, 70);
    doc.text(`Centro de Costo: ${apt.costCenter}`, 15, 75);
  } else if (data.mileage) {
    doc.text(`Kilometraje: ${data.mileage} km`, 15, 65);
  }
  
  doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 110, 60);
  if (type === 'report' && data.maintenanceType) {
    doc.text(`Tipo: ${data.maintenanceType}`, 110, 65);
    doc.text(`Horas Hombre: ${data.manHours}`, 110, 70);
  }

  if (type === 'checklist') {
    autoTable(doc, {
      startY: 85,
      head: [['Ítem', 'Estado']],
      body: [
        ['Luces', data.lights ? 'OK' : 'FALLA'],
        ['Neumáticos', data.tires ? 'OK' : 'FALLA'],
        ['Fluidos', data.fluids ? 'OK' : 'FALLA'],
        ['Frenos', data.brakes ? 'OK' : 'FALLA'],
        ['Carrocería', data.bodywork ? 'OK' : 'FALLA'],
        ['Interior', data.interior ? 'OK' : 'FALLA'],
        ['Observaciones', data.observations || 'Sin observaciones'],
      ],
      theme: 'striped',
      headStyles: { fillStyle: [30, 41, 59] }
    });
  } else if (type === 'report') {
    autoTable(doc, {
      startY: 85,
      head: [['Ítem', 'Cant.', 'Unidad', 'Costo Unit.', 'Total']],
      body: data.items.map((item: any) => [
        item.name,
        item.quantity,
        item.unit || 'unidades',
        `$${item.cost.toLocaleString()}`,
        `$${(item.quantity * item.cost).toLocaleString()}`
      ]),
      foot: [['', '', '', 'TOTAL', `$${data.totalCost?.toLocaleString() || '0'}`]],
      theme: 'striped',
      headStyles: { fillStyle: [30, 41, 59] }
    });
  } else if (type === 'supplies') {
    autoTable(doc, {
      startY: 85,
      head: [['Ítem', 'Cantidad', 'Prioridad', 'Razón']],
      body: [[data.item, data.quantity, data.priority, data.reason]],
      theme: 'striped',
      headStyles: { fillStyle: [30, 41, 59] }
    });
  }

  // Signatures for report and checklist
  if (type !== 'supplies') {
    const finalY = (doc as any).lastAutoTable.finalY + 30;
    doc.line(15, finalY, 85, finalY);
    doc.text('Firma Responsable', 15, finalY + 5);
    
    doc.line(125, finalY, 195, finalY);
    doc.text('Firma Supervisor/Cliente', 125, finalY + 5);
  }
  
  doc.save(`${type}_${ppu}_${format(new Date(), 'yyyyMMdd')}.pdf`);
};

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick, 
  collapsed 
}: { 
  icon: any, 
  label: string, 
  active: boolean, 
  onClick: () => void, 
  collapsed: boolean 
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center w-full p-3 my-1 rounded-lg transition-all duration-200 group",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon className={cn("w-5 h-5 min-w-[20px]", active ? "text-white" : "group-hover:text-white")} />
    {!collapsed && (
      <span className="ml-3 font-medium text-sm whitespace-nowrap overflow-hidden">
        {label}
      </span>
    )}
  </button>
);

const Card = ({ children, className, title, subtitle }: { children: React.ReactNode, className?: string, title?: string, subtitle?: string, key?: any }) => (
  <div className={cn("bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden", className)}>
    {(title || subtitle) && (
      <div className="px-6 py-4 border-bottom border-slate-200 dark:border-slate-800">
        {title && <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>}
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

const StatCard = ({ label, value, icon: Icon, color, trend }: { label: string, value: string | number, icon: any, color: string, trend?: string }) => (
  <Card className="relative overflow-hidden group">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{value}</h3>
        {trend && <p className="text-xs text-green-500 mt-1 font-medium">{trend}</p>}
      </div>
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    <div className={cn("absolute bottom-0 left-0 h-1 transition-all duration-500 w-0 group-hover:w-full", color.replace('bg-', 'bg-'))} />
  </Card>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", variants[variant])}>
      {children}
    </span>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorInfo: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <Card className="max-w-lg w-full p-8 border-red-500/50">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-4">Algo salió mal</h2>
            <p className="text-slate-400 mb-6">Se ha producido un error en la aplicación. Por favor, contacte al administrador.</p>
            <div className="bg-slate-800 p-4 rounded-lg text-left overflow-auto max-h-40 mb-6">
              <code className="text-xs text-red-400">{this.state.errorInfo}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg"
            >
              Reintentar
            </button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Views ---

interface DashboardProps {
  vehicles: Vehicle[];
  logs: MaintenanceLog[];
  projects: Project[];
}

const Dashboard = ({ vehicles, logs, projects }: DashboardProps) => {
  const maintenanceInterval = 10000; // 10,000 km
  
  const stats = [
    { 
      label: 'Vehículos en Taller', 
      value: vehicles.filter(v => v.status === 'maintenance').length, 
      icon: Wrench, 
      color: 'bg-amber-500',
      trend: `${vehicles.filter(v => v.status === 'active').length} operativos`
    },
    { 
      label: 'Mantenimientos Mes', 
      value: logs.filter(l => {
        const logDate = new Date(l.date as any);
        const now = new Date();
        return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
      }).length, 
      icon: CheckCircle2, 
      color: 'bg-green-500',
      trend: '+12% vs mes anterior'
    },
    { 
      label: 'Costo Total Mes', 
      value: `$${logs.reduce((acc, l) => {
        const logDate = new Date(l.date as any);
        const now = new Date();
        if (logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear()) {
          return acc + (l.totalCost || 0);
        }
        return acc;
      }, 0).toLocaleString()}`, 
      icon: DollarSign, 
      color: 'bg-blue-500'
    },
    { 
      label: 'Proyectos Activos', 
      value: projects.filter(p => p.status !== 'completed').length, 
      icon: GanttChartSquare, 
      color: 'bg-indigo-500'
    },
  ];

  const getPredictiveMaintenance = () => {
    return vehicles.map(v => {
      const kmSinceLast = (v as any).mileage % maintenanceInterval;
      const kmRemaining = maintenanceInterval - kmSinceLast;
      const priority = kmRemaining < 1000 ? 'high' : kmRemaining < 3000 ? 'medium' : 'low';
      return { ...v, kmRemaining, priority };
    }).sort((a, b) => a.kmRemaining - b.kmRemaining);
  };

  const predictiveData = getPredictiveMaintenance().slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <StatCard key={idx} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Distribución de Flota" subtitle="Por tipo de vehículo">
          <div className="h-80 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Patrullas', value: vehicles.filter(v => (v as any).type === 'patrulla').length },
                    { name: 'Grúas', value: vehicles.filter(v => (v as any).type === 'grua').length },
                    { name: 'Ambulancias', value: vehicles.filter(v => (v as any).type === 'ambulancia').length },
                    { name: 'Otros', value: vehicles.filter(v => !['patrulla', 'grua', 'ambulancia'].includes((v as any).type)).length },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Mantenimiento Predictivo" subtitle="Próximas intervenciones estimadas por kilometraje">
          <div className="space-y-4">
            {predictiveData.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    v.priority === 'high' ? "bg-red-500" : v.priority === 'medium' ? "bg-amber-500" : "bg-green-500"
                  )} />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{v.ppu}</p>
                    <p className="text-xs text-slate-500">{(v as any).brand} {(v as any).model}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{v.kmRemaining.toLocaleString()} km</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">para revisión</p>
                </div>
              </div>
            ))}
            {predictiveData.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                No hay datos de flota suficientes.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title="Actividad Reciente" subtitle="Últimas intervenciones y registros">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-500 text-sm uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="pb-3 font-semibold">Fecha</th>
                <th className="pb-3 font-semibold">PPU</th>
                <th className="pb-3 font-semibold">Tipo</th>
                <th className="pb-3 font-semibold">Responsable</th>
                <th className="pb-3 font-semibold">Costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {logs.slice(0, 10).map((log) => (
                <tr key={log.id} className="text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 text-slate-600 dark:text-slate-300">{format(parseISO(log.date as any), 'dd/MM/yyyy')}</td>
                  <td className="py-4 font-bold text-blue-500">{log.ppu}</td>
                  <td className="py-4 capitalize text-slate-600 dark:text-slate-300">{log.type}</td>
                  <td className="py-4 text-slate-600 dark:text-slate-300">{(log as any).performedByName || (log as any).requestedByName}</td>
                  <td className="py-4 font-bold text-slate-900 dark:text-white">
                    {log.totalCost ? `$${log.totalCost.toLocaleString()}` : '-'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">No hay actividad registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

interface SchedulingProps {
  user: FirebaseUser | null;
  setActiveTab: (tab: string) => void;
}

interface WorkshopProps {
  vehicles: Vehicle[];
  appointments: Appointment[];
  user: FirebaseUser | null;
  profile: UserProfile | null;
}

const Workshop = ({ vehicles, appointments, user, profile }: WorkshopProps) => {
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [step, setStep] = useState<'list' | 'checklist' | 'report'>('list');
  const [checklist, setChecklist] = useState<ChecklistData>({
    lights: true, tires: true, fluids: true, brakes: true, bodywork: true, interior: true, observations: ''
  });
  const [reportData, setReportData] = useState({
    maintenanceType: 'Preventiva',
    manHours: 0,
    items: [] as MaintenanceItem[]
  });
  const [newItem, setNewItem] = useState<MaintenanceItem>({
    name: '', quantity: 1, unit: 'unidades', cost: 0
  });

  const activeApts = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled');

  const handleChecklistSubmit = async () => {
    if (!selectedApt) return;
    try {
      await updateDoc(doc(db, 'appointments', selectedApt.id), { status: 'in_progress' });
      setStep('report');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'appointments');
    }
  };

  const addItem = () => {
    if (!newItem.name) return;
    setReportData({
      ...reportData,
      items: [...reportData.items, { ...newItem }]
    });
    setNewItem({ name: '', quantity: 1, unit: 'unidades', cost: 0 });
  };

  const removeItem = (index: number) => {
    setReportData({
      ...reportData,
      items: reportData.items.filter((_, i) => i !== index)
    });
  };

  const calculateTotal = () => {
    return reportData.items.reduce((acc, item) => acc + (item.quantity * item.cost), 0);
  };

  const generatePDF = (apt: Appointment, report: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('FleetMaster Workshop', 15, 25);
    doc.setFontSize(10);
    doc.text('Informe Final de Servicio', 15, 32);
    
    // Vehicle Info
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.text('Información del Vehículo', 15, 50);
    doc.line(15, 52, 195, 52);
    
    doc.setFontSize(10);
    doc.text(`PPU: ${apt.ppu}`, 15, 60);
    doc.text(`Kilometraje: ${apt.mileage} km`, 15, 65);
    doc.text(`Contrato: ${apt.contract}`, 15, 70);
    doc.text(`Centro de Costo: ${apt.costCenter}`, 15, 75);
    
    // Service Info
    doc.text('Detalles del Servicio', 110, 60);
    doc.text(`Tipo: ${report.maintenanceType}`, 110, 65);
    doc.text(`Horas Hombre: ${report.manHours}`, 110, 70);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 110, 75);
    
    // Items Table
    autoTable(doc, {
      startY: 85,
      head: [['Ítem', 'Cant.', 'Unidad', 'Costo Unit.', 'Total']],
      body: report.items.map((item: any) => [
        item.name,
        item.quantity,
        item.unit,
        `$${item.cost.toLocaleString()}`,
        `$${(item.quantity * item.cost).toLocaleString()}`
      ]),
      foot: [['', '', '', 'TOTAL', `$${calculateTotal().toLocaleString()}`]],
      theme: 'striped',
      headStyles: { fillStyle: [30, 41, 59] }
    });
    
    // Signatures
    const finalY = (doc as any).lastAutoTable.finalY + 30;
    doc.line(15, finalY, 85, finalY);
    doc.text('Firma Responsable Taller', 15, finalY + 5);
    
    doc.line(125, finalY, 195, finalY);
    doc.text('Firma Supervisor Flota', 125, finalY + 5);
    
    doc.save(`Informe_Servicio_${apt.ppu}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleFinalize = async () => {
    if (!selectedApt) return;
    try {
      await addDoc(collection(db, 'maintenance_logs'), {
        ppu: selectedApt.ppu,
        mileage: selectedApt.mileage,
        type: reportData.maintenanceType.toLowerCase(),
        status: 'completed',
        date: new Date().toISOString(),
        manHours: reportData.manHours,
        items: reportData.items,
        totalCost: calculateTotal(),
        performedBy: user?.uid,
        performedByName: profile?.displayName || user?.email
      });
      
      await updateDoc(doc(db, 'appointments', selectedApt.id), { status: 'completed' });
      
      generatePDF(selectedApt, reportData);
      
      alert("Informe finalizado, PDF generado y vehículo liberado.");
      setStep('list');
      setSelectedApt(null);
      setReportData({ maintenanceType: 'Preventiva', manHours: 0, items: [] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
    }
  };

  return (
    <div className="space-y-6">
      {step === 'list' && (
        <Card title="Operación de Taller" subtitle="Gestione los vehículos que ingresan y salen del taller">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeApts.map(apt => (
              <div 
                key={apt.id} 
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500 transition-all cursor-pointer group"
                onClick={() => { setSelectedApt(apt); setStep('checklist'); }}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xl font-bold text-blue-500">{apt.ppu}</span>
                  <Badge variant={apt.status === 'scheduled' ? 'info' : 'warning'}>{apt.status}</Badge>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{apt.reason}</p>
                <div className="flex items-center text-xs text-slate-500 gap-2">
                  <Clock className="w-3 h-3" />
                  {format(parseISO(apt.scheduledDate), 'dd/MM HH:mm')}
                </div>
              </div>
            ))}
            {activeApts.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                No hay vehículos pendientes de atención.
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 'checklist' && selectedApt && (
        <div className="max-w-3xl mx-auto">
          <Card title={`Checklist de Ingreso - ${selectedApt.ppu}`} subtitle="Valide el estado del vehículo al recibirlo">
            <div className="grid grid-cols-2 gap-6 mb-6">
              {Object.keys(checklist).filter(k => k !== 'observations').map(key => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <span className="capitalize text-slate-700 dark:text-slate-300">{key}</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setChecklist({...checklist, [key]: true})}
                      className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", (checklist as any)[key] ? "bg-green-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500")}
                    >OK</button>
                    <button 
                      onClick={() => setChecklist({...checklist, [key]: false})}
                      className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", !(checklist as any)[key] ? "bg-red-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500")}
                    >FALLA</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 mb-6">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones Adicionales</label>
              <textarea 
                rows={3}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                value={checklist.observations}
                onChange={e => setChecklist({...checklist, observations: e.target.value})}
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setStep('list')}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg"
              >Cancelar</button>
              <button 
                onClick={handleChecklistSubmit}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30"
              >Guardar e Iniciar Trabajos</button>
            </div>
          </Card>
        </div>
      )}

      {step === 'report' && selectedApt && (
        <div className="max-w-4xl mx-auto">
          <Card title={`Informe Final de Servicio - ${selectedApt.ppu}`} subtitle="Detalle los trabajos realizados e insumos empleados">
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de Mantención</label>
                  <select 
                    value={reportData.maintenanceType}
                    onChange={e => setReportData({...reportData, maintenanceType: e.target.value})}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Preventiva">Preventiva</option>
                    <option value="Correctiva">Correctiva</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Horas Hombre Totales</label>
                  <input 
                    type="number" 
                    value={reportData.manHours}
                    onChange={e => setReportData({...reportData, manHours: Number(e.target.value)})}
                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <Package className="w-4 h-4 text-blue-500" /> 
                  Insumos y Repuestos
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <input 
                    placeholder="Nombre ítem"
                    value={newItem.name}
                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                    className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                  <input 
                    type="number"
                    placeholder="Cant."
                    value={newItem.quantity}
                    onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})}
                    className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                  <input 
                    type="number"
                    placeholder="Costo Unit."
                    value={newItem.cost}
                    onChange={e => setNewItem({...newItem, cost: Number(e.target.value)})}
                    className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                  />
                  <button 
                    onClick={addItem}
                    className="bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                  >
                    Agregar
                  </button>
                </div>

                <div className="space-y-2">
                  {reportData.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.quantity} {item.unit} x ${item.cost.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-slate-900 dark:text-white">${(item.quantity * item.cost).toLocaleString()}</span>
                        <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {reportData.items.length > 0 && (
                    <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                      <div className="text-right">
                        <p className="text-sm text-slate-500 uppercase font-semibold">Total Insumos</p>
                        <p className="text-2xl font-bold text-blue-600">${calculateTotal().toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button 
                  onClick={() => setStep('list')}
                  className="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg"
                >Volver</button>
                <button 
                  onClick={handleFinalize}
                  className="flex-1 py-3 bg-green-600 text-white font-bold rounded-lg shadow-lg shadow-green-500/30"
                >Finalizar y Generar PDF</button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

interface ProjectsProps {
  projects: Project[];
}

interface SuppliesProps {
  logs: MaintenanceLog[];
}

const Supplies = ({ logs }: SuppliesProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newRequest, setNewRequest] = useState({
    item: '',
    quantity: 1,
    priority: 'medium' as 'low' | 'medium' | 'high',
    reason: ''
  });

  const handleAddRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'supply_requests'), {
        ...newRequest,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      generatePDF('supplies', newRequest);
      setIsAdding(false);
      setNewRequest({ item: '', quantity: 1, priority: 'medium', reason: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'supply_requests');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gestión de Insumos</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Control de stock y solicitudes de repuestos</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nueva Solicitud
        </button>
      </div>

      {isAdding && (
        <Card title="Solicitar Repuesto / Insumo">
          <form onSubmit={handleAddRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Ítem / Repuesto</label>
              <input 
                type="text" 
                required
                value={newRequest.item}
                onChange={e => setNewRequest({...newRequest, item: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Cantidad</label>
              <input 
                type="number" 
                required
                value={newRequest.quantity}
                onChange={e => setNewRequest({...newRequest, quantity: Number(e.target.value)})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Prioridad</label>
              <select 
                value={newRequest.priority}
                onChange={e => setNewRequest({...newRequest, priority: e.target.value as any})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Razón / Uso</label>
              <input 
                type="text" 
                required
                value={newRequest.reason}
                onChange={e => setNewRequest({...newRequest, reason: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2 flex justify-end space-x-3 pt-4">
              <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                Enviar Solicitud
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Stock Crítico" className="lg:col-span-1">
          <div className="space-y-4">
            {[
              { name: 'Aceite 10W40', stock: 5, min: 20 },
              { name: 'Filtro Aire P-100', stock: 2, min: 10 },
              { name: 'Pastillas Freno Del.', stock: 8, min: 15 },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                <div>
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">{item.name}</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70">Mínimo requerido: {item.min}</p>
                </div>
                <span className="text-lg font-black text-red-700 dark:text-red-400">{item.stock}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Consumo por Categoría" className="lg:col-span-2">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Lubricantes', total: 450000 },
                { name: 'Frenos', total: 280000 },
                { name: 'Neumáticos', total: 1200000 },
                { name: 'Iluminación', total: 150000 },
                { name: 'Carrocería', total: 320000 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};

interface FleetProps {
  vehicles: Vehicle[];
}

const Fleet = ({ vehicles }: FleetProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    ppu: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    type: 'patrulla',
    mileage: 0,
    status: 'active' as Vehicle['status']
  });

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'vehicles', newVehicle.ppu), {
        ...newVehicle,
        createdAt: new Date().toISOString()
      });
      setIsAdding(false);
      setNewVehicle({ ppu: '', brand: '', model: '', year: new Date().getFullYear(), type: 'patrulla', mileage: 0, status: 'active' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vehicles');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gestión de Flota</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Inventario detallado de todas las unidades</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Vehículo
        </button>
      </div>

      {isAdding && (
        <Card title="Registrar Nueva Unidad">
          <form onSubmit={handleAddVehicle} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">PPU (Patente)</label>
              <input 
                type="text" required
                value={newVehicle.ppu}
                onChange={e => setNewVehicle({...newVehicle, ppu: e.target.value.toUpperCase()})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Marca</label>
              <input 
                type="text" required
                value={newVehicle.brand}
                onChange={e => setNewVehicle({...newVehicle, brand: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Modelo</label>
              <input 
                type="text" required
                value={newVehicle.model}
                onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Año</label>
              <input 
                type="number" required
                value={newVehicle.year}
                onChange={e => setNewVehicle({...newVehicle, year: Number(e.target.value)})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Tipo</label>
              <select 
                value={newVehicle.type}
                onChange={e => setNewVehicle({...newVehicle, type: e.target.value as any})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              >
                <option value="patrulla">Patrulla</option>
                <option value="grua">Grúa</option>
                <option value="ambulancia">Ambulancia</option>
                <option value="camioneta">Camioneta</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Kilometraje Inicial</label>
              <input 
                type="number" required
                value={newVehicle.mileage}
                onChange={e => setNewVehicle({...newVehicle, mileage: Number(e.target.value)})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-3 flex justify-end space-x-3 pt-4">
              <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                Guardar Vehículo
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {vehicles.map(v => (
          <div key={v.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all group">
            <div className="h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center relative">
              <Car className="w-12 h-12 text-slate-300 dark:text-slate-700" />
              <div className="absolute top-3 right-3">
                <Badge variant={v.status === 'active' ? 'success' : v.status === 'maintenance' ? 'warning' : 'destructive'}>
                  {v.status.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{v.ppu}</h3>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{(v as any).brand} {(v as any).model}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">{v.mileage.toLocaleString()} km</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Odómetro</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 capitalize">{(v as any).type} • {(v as any).year}</span>
                <button className="text-blue-600 hover:text-blue-700 text-xs font-bold">Ver Historial →</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Users = ({ users }: { users: UserProfile[] }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    displayName: '',
    role: 'workshop' as UserProfile['role']
  });

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'users'), {
        ...newUser,
        createdAt: new Date().toISOString()
      });
      setIsAdding(false);
      setNewUser({ email: '', displayName: '', role: 'workshop' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Administración de Usuarios</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Gestión de roles y permisos</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </button>
      </div>

      {isAdding && (
        <Card title="Nuevo Usuario">
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Nombre Completo</label>
              <input 
                type="text" 
                required
                value={newUser.displayName}
                onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Email</label>
              <input 
                type="email" 
                required
                value={newUser.email}
                onChange={e => setNewUser({...newUser, email: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Rol</label>
              <select 
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role: e.target.value as UserProfile['role']})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              >
                <option value="admin">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="workshop">Taller</option>
                <option value="management">Gerencia</option>
                <option value="control">Control</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end space-x-3 pt-4">
              <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                Crear Usuario
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Lista de Usuarios">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Nombre</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Rol</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Fecha Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 text-sm font-bold text-slate-900 dark:text-white">{u.displayName}</td>
                  <td className="py-4 text-sm text-slate-600 dark:text-slate-400">{u.email}</td>
                  <td className="py-4">
                    <Badge variant={u.role === 'admin' ? 'danger' : u.role === 'management' ? 'info' : 'default'}>
                      {u.role.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="py-4 text-sm text-slate-600 dark:text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const Projects = ({ projects }: ProjectsProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    ppu: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    budget: 0,
    status: 'planning' as Project['status']
  });

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'projects'), {
        ...newProject,
        tasks: [],
        supplies: []
      });
      setIsAdding(false);
      setNewProject({ name: '', ppu: '', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], budget: 0, status: 'planning' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  };

  const getDaysRemaining = (endDate: string) => {
    const diff = new Date(endDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getProgress = (project: Project) => {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completed = project.tasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / project.tasks.length) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Configuración de Nuevas Unidades</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Gestión de proyectos de armado y equipamiento</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proyecto
        </button>
      </div>

      {isAdding && (
        <Card title="Nuevo Proyecto de Configuración">
          <form onSubmit={handleAddProject} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Nombre del Proyecto</label>
              <input 
                type="text" 
                required
                value={newProject.name}
                onChange={e => setNewProject({...newProject, name: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">PPU / Patente</label>
              <input 
                type="text" 
                required
                value={newProject.ppu}
                onChange={e => setNewProject({...newProject, ppu: e.target.value.toUpperCase()})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Presupuesto ($)</label>
              <input 
                type="number" 
                required
                value={newProject.budget}
                onChange={e => setNewProject({...newProject, budget: Number(e.target.value)})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Fecha Inicio</label>
              <input 
                type="date" 
                required
                value={newProject.startDate}
                onChange={e => setNewProject({...newProject, startDate: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Fecha Entrega</label>
              <input 
                type="date" 
                required
                value={newProject.endDate}
                onChange={e => setNewProject({...newProject, endDate: e.target.value})}
                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end space-x-3 pt-4">
              <button 
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
              >
                Crear Proyecto
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-6">
        {projects.map(project => {
          const progress = getProgress(project);
          const daysLeft = getDaysRemaining(project.endDate);
          
          return (
            <Card key={project.id} className="group">
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="lg:w-1/3 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">{project.name}</h3>
                      <p className="text-sm text-slate-500 font-medium">PPU: {project.ppu}</p>
                    </div>
                    <Badge variant={project.status === 'completed' ? 'success' : 'info'}>
                      {project.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Progreso</span>
                      <span className="font-bold text-slate-900 dark:text-white">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Presupuesto</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">${project.budget.toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Días Restantes</p>
                      <p className={cn("text-sm font-bold", daysLeft < 7 ? "text-red-500" : "text-amber-500")}>
                        {daysLeft > 0 ? `${daysLeft} días` : 'Vencido'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:w-2/3 border-l border-slate-100 dark:border-slate-800 lg:pl-8">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Tareas y Hitos
                  </h4>
                  <div className="space-y-3">
                    {project.tasks?.map((task, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            task.status === 'completed' ? "bg-green-500" : "bg-amber-500"
                          )} />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{task.name}</span>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">{task.responsible}</span>
                      </div>
                    ))}
                    {(!project.tasks || project.tasks.length === 0) && (
                      <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <p className="text-sm text-slate-500">No hay tareas definidas para este proyecto.</p>
                        <button className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700">+ Agregar Tarea</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {projects.length === 0 && (
          <Card className="text-center py-20">
            <GanttChartSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold">No hay proyectos activos</h3>
            <p className="text-slate-500">Inicie un nuevo proyecto de configuración para comenzar el seguimiento.</p>
          </Card>
        )}
      </div>
    </div>
  );
};

const Scheduling = ({ user, setActiveTab }: SchedulingProps) => {
  const [formData, setFormData] = useState({
    ppu: '',
    mileage: '',
    contract: '',
    costCenter: '',
    reason: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'appointments'), {
        ...formData,
        mileage: Number(formData.mileage),
        status: 'scheduled',
        supervisorUid: user?.uid,
        createdAt: new Date().toISOString()
      });
      alert("Agendamiento confirmado!");
      setActiveTab('dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card title="Agendar Revisión" subtitle="Ingrese los datos del vehículo para programar su ingreso">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PPU (Patente)</label>
              <input 
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="ABCD-12"
                value={formData.ppu}
                onChange={e => setFormData({...formData, ppu: e.target.value.toUpperCase()})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Kilometraje</label>
              <input 
                required
                type="number"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="125000"
                value={formData.mileage}
                onChange={e => setFormData({...formData, mileage: e.target.value})}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contrato</label>
              <input 
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.contract}
                onChange={e => setFormData({...formData, contract: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Centro de Costo</label>
              <input 
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.costCenter}
                onChange={e => setFormData({...formData, costCenter: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha y Hora de Ingreso</label>
            <input 
              required
              type="datetime-local"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones / Razón de Ingreso</label>
            <textarea 
              required
              rows={4}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Indique fallas o tipo de mantención..."
              value={formData.reason}
              onChange={e => setFormData({...formData, reason: e.target.value})}
            />
          </div>
          <button 
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
          >
            <Calendar className="w-5 h-5" />
            Confirmar Agendamiento
          </button>
        </form>
      </Card>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

// --- Views ---

interface DashboardProps {
  vehicles: Vehicle[];
  logs: MaintenanceLog[];
  projects: Project[];
}

const Dashboard = ({ vehicles, logs, projects }: DashboardProps) => {
  const maintenanceInterval = 10000; // 10,000 km
  
  const stats = [
    { 
      label: 'Vehículos en Taller', 
      value: vehicles.filter(v => v.status === 'maintenance').length, 
      icon: Wrench, 
      color: 'bg-amber-500',
      trend: `${vehicles.filter(v => v.status === 'active').length} operativos`
    },
    { 
      label: 'Mantenimientos Mes', 
      value: logs.filter(l => {
        const logDate = new Date(l.date);
        const now = new Date();
        return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
      }).length, 
      icon: CheckCircle2, 
      color: 'bg-green-500',
      trend: '+12% vs mes anterior'
    },
    { 
      label: 'Costo Total Mes', 
      value: `$${logs.reduce((acc, l) => {
        const logDate = new Date(l.date);
        const now = new Date();
        if (logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear()) {
          return acc + (l.totalCost || 0);
        }
        return acc;
      }, 0).toLocaleString()}`, 
      icon: DollarSign, 
      color: 'bg-blue-500'
    },
    { 
      label: 'Proyectos Activos', 
      value: projects.filter(p => p.status !== 'completed').length, 
      icon: GanttChartSquare, 
      color: 'bg-indigo-500'
    },
  ];

  const getPredictiveMaintenance = () => {
    return vehicles.map(v => {
      const kmSinceLast = v.mileage % maintenanceInterval;
      const kmRemaining = maintenanceInterval - kmSinceLast;
      const priority = kmRemaining < 1000 ? 'high' : kmRemaining < 3000 ? 'medium' : 'low';
      return { ...v, kmRemaining, priority };
    }).sort((a, b) => a.kmRemaining - b.kmRemaining);
  };

  const predictiveData = getPredictiveMaintenance().slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <StatCard key={idx} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Distribución de Flota" subtitle="Por tipo de vehículo">
          <div className="h-80 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Patrullas', value: vehicles.filter(v => v.type === 'patrulla').length },
                    { name: 'Grúas', value: vehicles.filter(v => v.type === 'grua').length },
                    { name: 'Ambulancias', value: vehicles.filter(v => v.type === 'ambulancia').length },
                    { name: 'Otros', value: vehicles.filter(v => !['patrulla', 'grua', 'ambulancia'].includes(v.type)).length },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Mantenimiento Predictivo" subtitle="Próximas intervenciones estimadas por kilometraje">
          <div className="space-y-4">
            {predictiveData.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    v.priority === 'high' ? "bg-red-500" : v.priority === 'medium' ? "bg-amber-500" : "bg-green-500"
                  )} />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{v.ppu}</p>
                    <p className="text-xs text-slate-500">{v.brand} {v.model}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{v.kmRemaining.toLocaleString()} km</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">para revisión</p>
                </div>
              </div>
            ))}
            {predictiveData.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                No hay datos de flota suficientes.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title="Actividad Reciente" subtitle="Últimas intervenciones y registros">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-500 text-sm uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="pb-3 font-semibold">Fecha</th>
                <th className="pb-3 font-semibold">PPU</th>
                <th className="pb-3 font-semibold">Tipo</th>
                <th className="pb-3 font-semibold">Responsable</th>
                <th className="pb-3 font-semibold">Costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {logs.slice(0, 10).map((log) => (
                <tr key={log.id} className="text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 text-slate-600 dark:text-slate-300">{format(parseISO(log.date), 'dd/MM/yyyy')}</td>
                  <td className="py-4 font-bold text-blue-500">{log.ppu}</td>
                  <td className="py-4 capitalize text-slate-600 dark:text-slate-300">{log.type}</td>
                  <td className="py-4 text-slate-600 dark:text-slate-300">{log.performedByName || log.requestedByName}</td>
                  <td className="py-4 font-bold text-slate-900 dark:text-white">
                    {log.totalCost ? `$${log.totalCost.toLocaleString()}` : '-'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">No hay actividad registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

interface SchedulingProps {
  user: FirebaseUser | null;
  setActiveTab: (tab: string) => void;
}

const Scheduling = ({ user, setActiveTab }: SchedulingProps) => {
  const [formData, setFormData] = useState({
    ppu: '',
    mileage: '',
    contract: '',
    costCenter: '',
    reason: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'appointments'), {
        ...formData,
        mileage: Number(formData.mileage),
        status: 'scheduled',
        supervisorUid: user?.uid,
        createdAt: new Date().toISOString()
      });
      alert("Agendamiento confirmado!");
      setActiveTab('dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card title="Agendar Revisión" subtitle="Ingrese los datos del vehículo para programar su ingreso">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PPU (Patente)</label>
              <input 
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="ABCD-12"
                value={formData.ppu}
                onChange={e => setFormData({...formData, ppu: e.target.value.toUpperCase()})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Kilometraje</label>
              <input 
                required
                type="number"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="125000"
                value={formData.mileage}
                onChange={e => setFormData({...formData, mileage: e.target.value})}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contrato</label>
              <input 
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.contract}
                onChange={e => setFormData({...formData, contract: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Centro de Costo</label>
              <input 
                required
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.costCenter}
                onChange={e => setFormData({...formData, costCenter: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha y Hora de Ingreso</label>
            <input 
              required
              type="datetime-local"
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones / Razón de Ingreso</label>
            <textarea 
              required
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
              placeholder="Describa el motivo del ingreso o fallas reportadas..."
              value={formData.reason}
              onChange={e => setFormData({...formData, reason: e.target.value})}
            />
          </div>
          <button 
            type="submit"
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            Confirmar Agendamiento
          </button>
        </form>
      </Card>
    </div>
  );
};

const Workshop = ({ appointments, user, profile }: { appointments: Appointment[], user: FirebaseUser | null, profile: UserProfile | null }) => {
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [step, setStep] = useState<'list' | 'checklist' | 'report'>('list');
  const [checklist, setChecklist] = useState<ChecklistData>({
    lights: true, tires: true, fluids: true, brakes: true, bodywork: true, interior: true, observations: ''
  });
  const [reportData, setReportData] = useState({
    maintenanceType: 'Preventiva',
    manHours: 0,
    items: [] as MaintenanceItem[]
  });
  const [newItem, setNewItem] = useState<MaintenanceItem>({
    name: '', quantity: 1, unit: 'unidades', cost: 0
  });

  const activeApts = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled');

  const handleChecklistSubmit = async () => {
    if (!selectedApt) return;
    try {
      await updateDoc(doc(db, 'appointments', selectedApt.id), { status: 'in_progress' });
      setStep('report');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'appointments');
    }
  };

  const addItem = () => {
    if (!newItem.name) return;
    setReportData({
      ...reportData,
      items: [...reportData.items, { ...newItem }]
    });
    setNewItem({ name: '', quantity: 1, unit: 'unidades', cost: 0 });
  };

  const removeItem = (index: number) => {
    setReportData({
      ...reportData,
      items: reportData.items.filter((_, i) => i !== index)
    });
  };

  const calculateTotal = () => {
    return reportData.items.reduce((acc, item) => acc + (item.quantity * item.cost), 0);
  };

  const generatePDF = (apt: Appointment, report: any) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('FleetMaster Workshop', 15, 25);
    doc.setFontSize(10);
    doc.text('Informe Final de Servicio', 15, 32);
    
    // Vehicle Info
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.text('Información del Vehículo', 15, 50);
    doc.line(15, 52, 195, 52);
    
    doc.setFontSize(10);
    doc.text(`PPU: ${apt.ppu}`, 15, 60);
    doc.text(`Kilometraje: ${apt.mileage} km`, 15, 65);
    doc.text(`Contrato: ${apt.contract}`, 15, 70);
    doc.text(`Centro de Costo: ${apt.costCenter}`, 15, 75);
    
    // Service Info
    doc.text('Detalles del Servicio', 110, 60);
    doc.text(`Tipo: ${report.maintenanceType}`, 110, 65);
    doc.text(`Horas Hombre: ${report.manHours}`, 110, 70);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 110, 75);
    
    // Items Table
    autoTable(doc, {
      startY: 85,
      head: [['Ítem', 'Cant.', 'Unidad', 'Costo Unit.', 'Total']],
      body: report.items.map((item: any) => [
        item.name,
        item.quantity,
        item.unit,
        `$${item.cost.toLocaleString()}`,
        `$${(item.quantity * item.cost).toLocaleString()}`
      ]),
      foot: [['', '', '', 'TOTAL', `$${calculateTotal().toLocaleString()}`]],
      theme: 'striped',
      headStyles: { fillStyle: [30, 41, 59] }
    });
    
    // Signatures
    const finalY = (doc as any).lastAutoTable.finalY + 30;
    doc.line(15, finalY, 85, finalY);
    doc.text('Firma Responsable Taller', 15, finalY + 5);
    
    doc.line(125, finalY, 195, finalY);
    doc.text('Firma Supervisor Flota', 125, finalY + 5);
    
    doc.save(`Informe_Servicio_${apt.ppu}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleFinalize = async () => {
    if (!selectedApt) return;
    try {
      await addDoc(collection(db, 'maintenance_logs'), {
        ppu: selectedApt.ppu,
        mileage: selectedApt.mileage,
        type: reportData.maintenanceType.toLowerCase(),
        status: 'completed',
        date: new Date().toISOString(),
        manHours: reportData.manHours,
        items: reportData.items,
        totalCost: calculateTotal(),
        performedBy: user?.uid,
        performedByName: profile?.displayName || user?.email
      });
      
      await updateDoc(doc(db, 'appointments', selectedApt.id), { status: 'completed' });
      
      generatePDF(selectedApt, reportData);
      
      alert("Informe finalizado, PDF generado y vehículo liberado.");
      setStep('list');
      setSelectedApt(null);
      setReportData({ maintenanceType: 'Preventiva', manHours: 0, items: [] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
    }
  };

  return (
    <div className="space-y-6">
      {step === 'list' && (
        <Card title="Operación de Taller" subtitle="Gestione los vehículos que ingresan y salen del taller">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeApts.map(apt => (
              <div 
                key={apt.id}
                onClick={() => { setSelectedApt(apt); setStep('checklist'); }}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-all cursor-pointer group bg-white dark:bg-slate-900 shadow-sm"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                    <Truck className="w-5 h-5" />
                  </div>
                  <Badge variant={apt.status === 'scheduled' ? 'warning' : 'info'}>
                    {apt.status === 'scheduled' ? 'Pendiente' : 'En Proceso'}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{apt.ppu}</h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">{apt.reason}</p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(parseISO(apt.date), 'dd/MM HH:mm')}
                  </div>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
            {activeApts.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                No hay vehículos agendados para hoy.
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 'checklist' && selectedApt && (
        <div className="max-w-3xl mx-auto space-y-6">
          <button onClick={() => setStep('list')} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver al listado
          </button>
          <Card title={`Checklist de Ingreso: ${selectedApt.ppu}`} subtitle="Verifique el estado inicial del vehículo">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {[
                { id: 'lights', label: 'Luces y Señalética' },
                { id: 'tires', label: 'Neumáticos y Presión' },
                { id: 'fluids', label: 'Niveles de Fluidos' },
                { id: 'brakes', label: 'Sistema de Frenos' },
                { id: 'bodywork', label: 'Carrocería Exterior' },
                { id: 'interior', label: 'Estado Interior' },
              ].map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
                  <button 
                    onClick={() => setChecklist({...checklist, [item.id]: !checklist[item.id as keyof ChecklistData]})}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                      checklist[item.id as keyof ChecklistData] 
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    )}
                  >
                    {checklist[item.id as keyof ChecklistData] ? 'OK' : 'FALLA'}
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2 mb-8">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones Adicionales</label>
              <textarea 
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-[100px]"
                value={checklist.observations}
                onChange={e => setChecklist({...checklist, observations: e.target.value})}
              />
            </div>
            <button 
              onClick={handleChecklistSubmit}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20"
            >
              Iniciar Reparación / Mantención
            </button>
          </Card>
        </div>
      )}

      {step === 'report' && selectedApt && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <button onClick={() => setStep('checklist')} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Volver al checklist
            </button>
            <div className="flex items-center gap-3">
              <Badge variant="info">{selectedApt.ppu}</Badge>
              <Badge variant="outline">{selectedApt.contract}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card title="Detalle de Intervención" subtitle="Registre repuestos, insumos y mano de obra">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de Mantención</label>
                    <select 
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      value={reportData.maintenanceType}
                      onChange={e => setReportData({...reportData, maintenanceType: e.target.value})}
                    >
                      <option>Preventiva</option>
                      <option>Correctiva</option>
                      <option>Garantía</option>
                      <option>Siniestro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Horas Hombre</label>
                    <input 
                      type="number"
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      value={reportData.manHours}
                      onChange={e => setReportData({...reportData, manHours: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="space-y-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Agregar Ítem</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <input 
                      placeholder="Descripción"
                      className="md:col-span-2 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      value={newItem.name}
                      onChange={e => setNewItem({...newItem, name: e.target.value})}
                    />
                    <input 
                      type="number"
                      placeholder="Cant."
                      className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      value={newItem.quantity}
                      onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})}
                    />
                    <input 
                      type="number"
                      placeholder="Costo Unit."
                      className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      value={newItem.cost}
                      onChange={e => setNewItem({...newItem, cost: Number(e.target.value)})}
                    />
                  </div>
                  <button 
                    onClick={addItem}
                    className="w-full py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-lg flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Añadir a la lista
                  </button>
                </div>

                <div className="mt-8 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <th className="pb-2">Descripción</th>
                        <th className="pb-2">Cant.</th>
                        <th className="pb-2">Total</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {reportData.items.map((item, idx) => (
                        <tr key={idx} className="text-sm">
                          <td className="py-3 text-slate-700 dark:text-slate-300">{item.name}</td>
                          <td className="py-3 text-slate-500">{item.quantity}</td>
                          <td className="py-3 font-bold text-slate-900 dark:text-white">${(item.quantity * item.cost).toLocaleString()}</td>
                          <td className="py-3 text-right">
                            <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Resumen de Costos">
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Repuestos e Insumos</span>
                    <span className="font-bold text-slate-900 dark:text-white">${calculateTotal().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Mano de Obra ({reportData.manHours}h)</span>
                    <span className="font-bold text-slate-900 dark:text-white">Incluida</span>
                  </div>
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-end">
                    <span className="text-sm font-bold uppercase text-slate-500">Total Neto</span>
                    <span className="text-2xl font-black text-blue-600">${calculateTotal().toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={handleFinalize}
                    className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Finalizar y Generar PDF
                  </button>
                </div>
              </Card>

              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Al finalizar, el vehículo quedará marcado como <strong>Operativo</strong> y se enviará el informe al supervisor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // Data states
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Auth & Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // Create default profile for new user
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || 'User',
            role: u.email === 'Geologol@gmail.com' ? 'admin' : 'supervisor',
            createdAt: new Date().toISOString(),
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Real-time listeners
  useEffect(() => {
    if (!user) return;

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snap) => {
      setVehicles(snap.docs.map(d => d.data() as Vehicle));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles'));
    const unsubAppointments = onSnapshot(query(collection(db, 'appointments'), orderBy('scheduledDate', 'desc')), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));
    const unsubLogs = onSnapshot(query(collection(db, 'maintenance_logs'), orderBy('completedAt', 'desc')), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as MaintenanceLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maintenance_logs'));
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'projects'));
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    return () => {
      unsubVehicles();
      unsubAppointments();
      unsubLogs();
      unsubProjects();
      unsubUsers();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = () => signOut(auth);

  const generatePDF = (type: 'checklist' | 'report' | 'insumos', data: any) => {
    const doc = new jsPDF();
    const title = type === 'checklist' ? 'Checklist de Vehículo' : type === 'report' ? 'Informe de Servicio' : 'Solicitud de Insumos';
    
    doc.setFontSize(20);
    doc.text(title, 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 35);
    doc.text(`Vehículo (PPU): ${data.ppu}`, 20, 45);
    
    if (type === 'checklist') {
      autoTable(doc, {
        startY: 55,
        head: [['Ítem', 'Estado']],
        body: [
          ['Luces', data.lights ? 'OK' : 'Falla'],
          ['Neumáticos', data.tires ? 'OK' : 'Falla'],
          ['Fluidos', data.fluids ? 'OK' : 'Falla'],
          ['Frenos', data.brakes ? 'OK' : 'Falla'],
          ['Carrocería', data.bodywork ? 'OK' : 'Falla'],
          ['Interior', data.interior ? 'OK' : 'Falla'],
          ['Observaciones', data.observations || 'N/A'],
        ],
      });
    } else if (type === 'report') {
      autoTable(doc, {
        startY: 55,
        head: [['Descripción', 'Cantidad', 'Costo Unit.', 'Total']],
        body: data.items.map((item: any) => [
          item.type,
          `${item.quantity} ${item.unit}`,
          `$${item.cost}`,
          `$${item.quantity * item.cost}`
        ]),
      });
      doc.text(`Total Horas: ${data.totalHours}`, 20, (doc as any).lastAutoTable.finalY + 10);
      doc.text(`Costo Total: $${data.totalCost}`, 20, (doc as any).lastAutoTable.finalY + 20);
    }

    doc.save(`${type}_${data.ppu}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };



  const Scheduling = () => {
    const [formData, setFormData] = useState({
      ppu: '',
      mileage: '',
      contract: '',
      costCenter: '',
      reason: '',
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm")
    });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await addDoc(collection(db, 'appointments'), {
          ...formData,
          mileage: Number(formData.mileage),
          status: 'scheduled',
          supervisorUid: user?.uid,
          createdAt: new Date().toISOString()
        });
        alert("Agendamiento confirmado!");
        setActiveTab('dashboard');
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <div className="max-w-2xl mx-auto">
        <Card title="Agendar Revisión" subtitle="Ingrese los datos del vehículo para programar su ingreso">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PPU (Patente)</label>
                <input 
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="ABCD-12"
                  value={formData.ppu}
                  onChange={e => setFormData({...formData, ppu: e.target.value.toUpperCase()})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Kilometraje</label>
                <input 
                  required
                  type="number"
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="125000"
                  value={formData.mileage}
                  onChange={e => setFormData({...formData, mileage: e.target.value})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contrato</label>
                <input 
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.contract}
                  onChange={e => setFormData({...formData, contract: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Centro de Costo</label>
                <input 
                  required
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.costCenter}
                  onChange={e => setFormData({...formData, costCenter: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha y Hora de Ingreso</label>
              <input 
                required
                type="datetime-local"
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones / Razón de Ingreso</label>
              <textarea 
                required
                rows={4}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Indique fallas o tipo de mantención..."
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
              />
            </div>
            <button 
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              Confirmar Agendamiento
            </button>
          </form>
        </Card>
      </div>
    );
  };

  const Workshop = () => {
    const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
    const [step, setStep] = useState<'list' | 'checklist' | 'report'>('list');
    const [checklist, setChecklist] = useState<ChecklistData>({
      lights: true, tires: true, fluids: true, brakes: true, bodywork: true, interior: true, observations: ''
    });
    const [reportData, setReportData] = useState({
      maintenanceType: 'Preventiva',
      manHours: 0,
      items: [] as MaintenanceItem[]
    });
    const [newItem, setNewItem] = useState<MaintenanceItem>({
      name: '', quantity: 1, unit: 'unidades', cost: 0
    });

    const activeApts = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled');

    const handleChecklistSubmit = async () => {
      if (!selectedApt) return;
      try {
        await updateDoc(doc(db, 'appointments', selectedApt.id), { status: 'in_progress' });
        setStep('report');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'appointments');
      }
    };

    const addItem = () => {
      if (!newItem.name) return;
      setReportData({
        ...reportData,
        items: [...reportData.items, { ...newItem }]
      });
      setNewItem({ name: '', quantity: 1, unit: 'unidades', cost: 0 });
    };

    const removeItem = (index: number) => {
      setReportData({
        ...reportData,
        items: reportData.items.filter((_, i) => i !== index)
      });
    };

    const calculateTotal = () => {
      return reportData.items.reduce((acc, item) => acc + (item.quantity * item.cost), 0);
    };

    const generatePDF = (apt: Appointment, report: any) => {
      const doc = new jsPDF();
      
      // Header
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('FleetMaster Workshop', 15, 25);
      doc.setFontSize(10);
      doc.text('Informe Final de Servicio', 15, 32);
      
      // Vehicle Info
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.text('Información del Vehículo', 15, 50);
      doc.line(15, 52, 195, 52);
      
      doc.setFontSize(10);
      doc.text(`PPU: ${apt.ppu}`, 15, 60);
      doc.text(`Kilometraje: ${apt.mileage} km`, 15, 65);
      doc.text(`Contrato: ${apt.contract}`, 15, 70);
      doc.text(`Centro de Costo: ${apt.costCenter}`, 15, 75);
      
      // Service Info
      doc.text('Detalles del Servicio', 110, 60);
      doc.text(`Tipo: ${report.maintenanceType}`, 110, 65);
      doc.text(`Horas Hombre: ${report.manHours}`, 110, 70);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 110, 75);
      
      // Items Table
      autoTable(doc, {
        startY: 85,
        head: [['Ítem', 'Cant.', 'Unidad', 'Costo Unit.', 'Total']],
        body: report.items.map((item: any) => [
          item.name,
          item.quantity,
          item.unit,
          `$${item.cost.toLocaleString()}`,
          `$${(item.quantity * item.cost).toLocaleString()}`
        ]),
        foot: [['', '', '', 'TOTAL', `$${calculateTotal().toLocaleString()}`]],
        theme: 'striped',
        headStyles: { fillStyle: [30, 41, 59] }
      });
      
      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 30;
      doc.line(15, finalY, 85, finalY);
      doc.text('Firma Responsable Taller', 15, finalY + 5);
      
      doc.line(125, finalY, 195, finalY);
      doc.text('Firma Supervisor Flota', 125, finalY + 5);
      
      doc.save(`Informe_Servicio_${apt.ppu}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    };

    const handleFinalize = async () => {
      if (!selectedApt) return;
      try {
        await addDoc(collection(db, 'maintenance_logs'), {
          ppu: selectedApt.ppu,
          mileage: selectedApt.mileage,
          type: reportData.maintenanceType.toLowerCase(),
          status: 'completed',
          date: new Date().toISOString(),
          manHours: reportData.manHours,
          items: reportData.items,
          totalCost: calculateTotal(),
          performedBy: user?.uid,
          performedByName: profile?.displayName || user?.email
        });
        
        await updateDoc(doc(db, 'appointments', selectedApt.id), { status: 'completed' });
        
        generatePDF(selectedApt, reportData);
        
        alert("Informe finalizado, PDF generado y vehículo liberado.");
        setStep('list');
        setSelectedApt(null);
        setReportData({ maintenanceType: 'Preventiva', manHours: 0, items: [] });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
      }
    };

    return (
      <div className="space-y-6">
        {step === 'list' && (
          <Card title="Operación de Taller" subtitle="Gestione los vehículos que ingresan y salen del taller">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeApts.map(apt => (
                <div 
                  key={apt.id} 
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500 transition-all cursor-pointer group"
                  onClick={() => { setSelectedApt(apt); setStep('checklist'); }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xl font-bold text-blue-500">{apt.ppu}</span>
                    <Badge variant={apt.status === 'scheduled' ? 'info' : 'warning'}>{apt.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{apt.reason}</p>
                  <div className="flex items-center text-xs text-slate-500 gap-2">
                    <Clock className="w-3 h-3" />
                    {format(parseISO(apt.scheduledDate), 'dd/MM HH:mm')}
                  </div>
                </div>
              ))}
              {activeApts.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500">
                  No hay vehículos pendientes de atención.
                </div>
              )}
            </div>
          </Card>
        )}

        {step === 'checklist' && selectedApt && (
          <div className="max-w-3xl mx-auto">
            <Card title={`Checklist de Ingreso - ${selectedApt.ppu}`} subtitle="Valide el estado del vehículo al recibirlo">
              <div className="grid grid-cols-2 gap-6 mb-6">
                {Object.keys(checklist).filter(k => k !== 'observations').map(key => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <span className="capitalize text-slate-700 dark:text-slate-300">{key}</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setChecklist({...checklist, [key]: true})}
                        className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", (checklist as any)[key] ? "bg-green-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500")}
                      >OK</button>
                      <button 
                        onClick={() => setChecklist({...checklist, [key]: false})}
                        className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", !(checklist as any)[key] ? "bg-red-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500")}
                      >FALLA</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 mb-6">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Observaciones Adicionales</label>
                <textarea 
                  rows={3}
                  className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  value={checklist.observations}
                  onChange={e => setChecklist({...checklist, observations: e.target.value})}
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setStep('list')}
                  className="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg"
                >Cancelar</button>
                <button 
                  onClick={handleChecklistSubmit}
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30"
                >Guardar e Iniciar Trabajos</button>
              </div>
            </Card>
          </div>
        )}

        {step === 'report' && selectedApt && (
          <div className="max-w-4xl mx-auto">
            <Card title={`Informe Final de Servicio - ${selectedApt.ppu}`} subtitle="Detalle los trabajos realizados e insumos empleados">
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de Mantención</label>
                    <select 
                      value={reportData.maintenanceType}
                      onChange={e => setReportData({...reportData, maintenanceType: e.target.value})}
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="Preventiva">Preventiva</option>
                      <option value="Correctiva">Correctiva</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Horas Hombre Totales</label>
                    <input 
                      type="number" 
                      value={reportData.manHours}
                      onChange={e => setReportData({...reportData, manHours: Number(e.target.value)})}
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <Package className="w-4 h-4 text-blue-500" /> 
                    Insumos y Repuestos
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                    <input 
                      placeholder="Nombre ítem"
                      value={newItem.name}
                      onChange={e => setNewItem({...newItem, name: e.target.value})}
                      className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                    />
                    <input 
                      type="number"
                      placeholder="Cant."
                      value={newItem.quantity}
                      onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})}
                      className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                    />
                    <input 
                      type="number"
                      placeholder="Costo Unit."
                      value={newItem.cost}
                      onChange={e => setNewItem({...newItem, cost: Number(e.target.value)})}
                      className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
                    />
                    <button 
                      onClick={addItem}
                      className="bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                    >
                      Agregar
                    </button>
                  </div>

                  <div className="space-y-2">
                    {reportData.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.quantity} {item.unit} x ${item.cost.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-slate-900 dark:text-white">${(item.quantity * item.cost).toLocaleString()}</span>
                          <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {reportData.items.length > 0 && (
                      <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                        <div className="text-right">
                          <p className="text-sm text-slate-500 uppercase font-semibold">Total Insumos</p>
                          <p className="text-2xl font-bold text-blue-600">${calculateTotal().toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <button 
                    onClick={() => setStep('list')}
                    className="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg"
                  >Volver</button>
                  <button 
                    onClick={handleFinalize}
                    className="flex-1 py-3 bg-green-600 text-white font-bold rounded-lg shadow-lg shadow-green-500/30"
                  >Finalizar y Generar PDF</button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const Projects = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [newProject, setNewProject] = useState({
      name: '',
      ppu: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      budget: 0,
      status: 'planning' as Project['status']
    });

    const handleAddProject = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await addDoc(collection(db, 'projects'), {
          ...newProject,
          tasks: [],
          supplies: []
        });
        setIsAdding(false);
        setNewProject({ name: '', ppu: '', startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], budget: 0, status: 'planning' });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'projects');
      }
    };

    const getDaysRemaining = (endDate: string) => {
      const diff = new Date(endDate).getTime() - new Date().getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    const getProgress = (project: Project) => {
      if (!project.tasks || project.tasks.length === 0) return 0;
      const completed = project.tasks.filter(t => t.status === 'completed').length;
      return Math.round((completed / project.tasks.length) * 100);
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Configuración de Nuevas Unidades</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Gestión de proyectos de armado y equipamiento</p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Proyecto
          </button>
        </div>

        {isAdding && (
          <Card title="Nuevo Proyecto de Configuración">
            <form onSubmit={handleAddProject} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Nombre del Proyecto</label>
                <input 
                  type="text" 
                  required
                  value={newProject.name}
                  onChange={e => setNewProject({...newProject, name: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">PPU / Patente</label>
                <input 
                  type="text" 
                  required
                  value={newProject.ppu}
                  onChange={e => setNewProject({...newProject, ppu: e.target.value.toUpperCase()})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Presupuesto ($)</label>
                <input 
                  type="number" 
                  required
                  value={newProject.budget}
                  onChange={e => setNewProject({...newProject, budget: Number(e.target.value)})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Fecha Inicio</label>
                <input 
                  type="date" 
                  required
                  value={newProject.startDate}
                  onChange={e => setNewProject({...newProject, startDate: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Fecha Entrega</label>
                <input 
                  type="date" 
                  required
                  value={newProject.endDate}
                  onChange={e => setNewProject({...newProject, endDate: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3 flex justify-end space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  Crear Proyecto
                </button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-6">
          {projects.map(project => {
            const progress = getProgress(project);
            const daysLeft = getDaysRemaining(project.endDate);
            
            return (
              <Card key={project.id} className="group">
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="lg:w-1/3 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">{project.name}</h3>
                        <p className="text-sm text-slate-500 font-medium">PPU: {project.ppu}</p>
                      </div>
                      <Badge variant={project.status === 'completed' ? 'success' : 'info'}>
                        {project.status.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Progreso</span>
                        <span className="font-bold text-slate-900 dark:text-white">{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Presupuesto</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">${project.budget.toLocaleString()}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Días Restantes</p>
                        <p className={cn("text-sm font-bold", daysLeft < 7 ? "text-red-500" : "text-amber-500")}>
                          {daysLeft > 0 ? `${daysLeft} días` : 'Vencido'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="lg:w-2/3 border-l border-slate-100 dark:border-slate-800 lg:pl-8">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Tareas y Hitos
                    </h4>
                    <div className="space-y-3">
                      {project.tasks?.map((task, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              task.status === 'completed' ? "bg-green-500" : "bg-amber-500"
                            )} />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{task.name}</span>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">{task.responsible}</span>
                        </div>
                      ))}
                      {(!project.tasks || project.tasks.length === 0) && (
                        <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                          <p className="text-sm text-slate-500">No hay tareas definidas para este proyecto.</p>
                          <button className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700">+ Agregar Tarea</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {projects.length === 0 && (
            <Card className="text-center py-20">
              <GanttChartSquare className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold">No hay proyectos activos</h3>
              <p className="text-slate-500">Inicie un nuevo proyecto de configuración para comenzar el seguimiento.</p>
            </Card>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-12">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-500/20">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">FleetMaster</h1>
          <p className="text-slate-400 mb-8">Gestión Inteligente de Flota y Taller</p>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Ingresar con Google
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex", darkMode ? "dark bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900")}>
      {/* Sidebar */}
      <aside className={cn(
        "bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col",
        sidebarCollapsed ? "w-20" : "w-64"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && <span className="font-bold text-xl tracking-tight">FleetMaster</span>}
        </div>

        <nav className="flex-1 px-4 py-4">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} collapsed={sidebarCollapsed} />
          <SidebarItem icon={Calendar} label="Agendamiento" active={activeTab === 'scheduling'} onClick={() => setActiveTab('scheduling')} collapsed={sidebarCollapsed} />
          <SidebarItem icon={Wrench} label="Taller" active={activeTab === 'workshop'} onClick={() => setActiveTab('workshop')} collapsed={sidebarCollapsed} />
          <SidebarItem icon={GanttChartSquare} label="Proyectos" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} collapsed={sidebarCollapsed} />
          <SidebarItem icon={Package} label="Insumos" active={activeTab === 'supplies'} onClick={() => setActiveTab('supplies')} collapsed={sidebarCollapsed} />
          <SidebarItem icon={Truck} label="Flota" active={activeTab === 'fleet'} onClick={() => setActiveTab('fleet')} collapsed={sidebarCollapsed} />
          <SidebarItem icon={Users} label="Usuarios" active={activeTab === 'users'} onClick={() => setActiveTab('users')} collapsed={sidebarCollapsed} />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center w-full p-3 text-slate-400 hover:text-white transition-colors"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {!sidebarCollapsed && <span className="ml-3 text-sm font-medium">{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>}
          </button>
          <button 
            onClick={handleLogout}
            className="flex items-center w-full p-3 text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {!sidebarCollapsed && <span className="ml-3 text-sm font-medium">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold">{profile?.displayName}</p>
              <p className="text-xs text-slate-500 uppercase font-semibold">{profile?.role}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center border-2 border-blue-500/50">
              <UserCheck className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
  const Supplies = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [newSupply, setNewSupply] = useState({
      ppu: '',
      mileage: '',
      contract: '',
      costCenter: '',
      item: '',
      quantity: 1,
      unit: 'litros',
      cost: 0
    });

    const handleAddSupply = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await addDoc(collection(db, 'maintenance_logs'), {
          ...newSupply,
          type: 'supply_request',
          status: 'pending',
          date: new Date().toISOString(),
          requestedBy: user?.uid,
          requestedByName: profile?.displayName || user?.email
        });
        setIsAdding(false);
        setNewSupply({ ppu: '', mileage: '', contract: '', costCenter: '', item: '', quantity: 1, unit: 'litros', cost: 0 });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Gestión de Insumos</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Solicitud y control de repuestos y consumibles</p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Solicitud
          </button>
        </div>

        {isAdding && (
          <Card title="Nueva Solicitud de Insumos">
            <form onSubmit={handleAddSupply} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">PPU / Patente</label>
                <input 
                  type="text" 
                  required
                  value={newSupply.ppu}
                  onChange={e => setNewSupply({...newSupply, ppu: e.target.value.toUpperCase()})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Kilometraje</label>
                <input 
                  type="number" 
                  required
                  value={newSupply.mileage}
                  onChange={e => setNewSupply({...newSupply, mileage: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Insumo / Repuesto</label>
                <input 
                  type="text" 
                  required
                  value={newSupply.item}
                  onChange={e => setNewSupply({...newSupply, item: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Cantidad</label>
                <input 
                  type="number" 
                  required
                  value={newSupply.quantity}
                  onChange={e => setNewSupply({...newSupply, quantity: Number(e.target.value)})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Unidad</label>
                <select 
                  value={newSupply.unit}
                  onChange={e => setNewSupply({...newSupply, unit: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="litros">Litros</option>
                  <option value="unidades">Unidades</option>
                  <option value="kg">Kilogramos</option>
                  <option value="metros">Metros</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Costo Unitario ($)</label>
                <input 
                  type="number" 
                  required
                  value={newSupply.cost}
                  onChange={e => setNewSupply({...newSupply, cost: Number(e.target.value)})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-4 flex justify-end space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  Enviar Solicitud
                </button>
              </div>
            </form>
          </Card>
        )}

        <Card title="Solicitudes Recientes">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">PPU</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Insumo</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Cantidad</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Costo Total</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.filter(l => l.type === 'supply_request').map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(log.date).toLocaleDateString()}
                    </td>
                    <td className="py-4 text-sm font-bold text-slate-900 dark:text-white">{log.ppu}</td>
                    <td className="py-4 text-sm text-slate-900 dark:text-white">{log.item}</td>
                    <td className="py-4 text-sm text-slate-600 dark:text-slate-400">
                      {log.quantity} {log.unit}
                    </td>
                    <td className="py-4 text-sm font-bold text-slate-900 dark:text-white">
                      ${((log.quantity || 0) * (log.cost || 0)).toLocaleString()}
                    </td>
                    <td className="py-4">
                      <Badge variant={log.status === 'completed' ? 'success' : 'warning'}>
                        {log.status === 'completed' ? 'Entregado' : 'Pendiente'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const Fleet = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [newVehicle, setNewVehicle] = useState({
      ppu: '',
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      type: 'patrulla',
      mileage: 0,
      contract: '',
      costCenter: '',
      status: 'active'
    });

    const handleAddVehicle = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await addDoc(collection(db, 'vehicles'), {
          ...newVehicle,
          lastMaintenance: new Date().toISOString()
        });
        setIsAdding(false);
        setNewVehicle({ ppu: '', brand: '', model: '', year: new Date().getFullYear(), type: 'patrulla', mileage: 0, contract: '', costCenter: '', status: 'active' });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'vehicles');
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Base de Datos de Flota</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Registro y control de unidades</p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Añadir Vehículo
          </button>
        </div>

        {isAdding && (
          <Card title="Nuevo Vehículo">
            <form onSubmit={handleAddVehicle} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">PPU / Patente</label>
                <input 
                  type="text" 
                  required
                  value={newVehicle.ppu}
                  onChange={e => setNewVehicle({...newVehicle, ppu: e.target.value.toUpperCase()})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Marca</label>
                <input 
                  type="text" 
                  required
                  value={newVehicle.brand}
                  onChange={e => setNewVehicle({...newVehicle, brand: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Modelo</label>
                <input 
                  type="text" 
                  required
                  value={newVehicle.model}
                  onChange={e => setNewVehicle({...newVehicle, model: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Año</label>
                <input 
                  type="number" 
                  required
                  value={newVehicle.year}
                  onChange={e => setNewVehicle({...newVehicle, year: Number(e.target.value)})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Tipo</label>
                <select 
                  value={newVehicle.type}
                  onChange={e => setNewVehicle({...newVehicle, type: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="patrulla">Patrulla</option>
                  <option value="grua">Grúa</option>
                  <option value="ambulancia">Ambulancia</option>
                  <option value="rescate">Rescate</option>
                  <option value="apoyo">Apoyo</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Kilometraje Actual</label>
                <input 
                  type="number" 
                  required
                  value={newVehicle.mileage}
                  onChange={e => setNewVehicle({...newVehicle, mileage: Number(e.target.value)})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Contrato</label>
                <input 
                  type="text" 
                  required
                  value={newVehicle.contract}
                  onChange={e => setNewVehicle({...newVehicle, contract: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Centro de Costo</label>
                <input 
                  type="text" 
                  required
                  value={newVehicle.costCenter}
                  onChange={e => setNewVehicle({...newVehicle, costCenter: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-4 flex justify-end space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  Añadir Vehículo
                </button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map(vehicle => (
            <Card key={vehicle.id} className="hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{vehicle.ppu}</h3>
                  <p className="text-sm text-slate-500">{vehicle.brand} {vehicle.model} ({vehicle.year})</p>
                </div>
                <Badge variant={vehicle.status === 'active' ? 'success' : 'warning'}>
                  {vehicle.status === 'active' ? 'Activo' : 'Taller'}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Kilometraje:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{vehicle.mileage.toLocaleString()} km</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Contrato:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{vehicle.contract}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Centro de Costo:</span>
                  <span className="font-medium text-slate-900 dark:text-white">{vehicle.costCenter}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400">Último Mantenimiento: {new Date(vehicle.lastMaintenance).toLocaleDateString()}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const Users = () => {
    const [isAdding, setIsAdding] = useState(false);
    const [newUser, setNewUser] = useState({
      email: '',
      displayName: '',
      role: 'workshop' as UserProfile['role']
    });

    const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        // In a real app, we would use Firebase Admin SDK or a Cloud Function to create the user
        // For this demo, we'll just add the profile to the users collection
        await addDoc(collection(db, 'users'), {
          ...newUser,
          createdAt: new Date().toISOString()
        });
        setIsAdding(false);
        setNewUser({ email: '', displayName: '', role: 'workshop' });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'users');
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Administración de Usuarios</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Gestión de roles y permisos</p>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Usuario
          </button>
        </div>

        {isAdding && (
          <Card title="Nuevo Usuario">
            <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Nombre Completo</label>
                <input 
                  type="text" 
                  required
                  value={newUser.displayName}
                  onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Email</label>
                <input 
                  type="email" 
                  required
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Rol</label>
                <select 
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value as UserProfile['role']})}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="admin">Administrador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="workshop">Taller</option>
                  <option value="management">Gerencia</option>
                  <option value="control">Control</option>
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-3 flex justify-end space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </Card>
        )}

        <Card title="Lista de Usuarios">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Nombre</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Rol</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">Fecha Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 text-sm font-bold text-slate-900 dark:text-white">{u.displayName}</td>
                    <td className="py-4 text-sm text-slate-600 dark:text-slate-400">{u.email}</td>
                    <td className="py-4">
                      <Badge variant={u.role === 'admin' ? 'danger' : u.role === 'management' ? 'info' : 'default'}>
                        {u.role.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-4 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'scheduling' && <Scheduling />}
              {activeTab === 'workshop' && <Workshop />}
              {activeTab === 'projects' && <Projects />}
              {activeTab === 'supplies' && <Supplies />}
              {activeTab === 'fleet' && <Fleet />}
              {activeTab === 'users' && <Users />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
