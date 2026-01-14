
export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF'
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
}

export interface Product {
  id: string; // SKU / Barcode
  name: string;
  category: string;
  phoneType: string;
  variant: string; // Type like Slim Matte, etc.
  color?: string;
  stock: number;
  minStock: number;
  createdAt: number;
}

export enum TransactionType {
  IN = 'IN',
  OUT = 'OUT'
}

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  type: TransactionType;
  quantity: number;
  note: string;
  timestamp: number;
  userName: string;
}

export interface AppState {
  products: Product[];
  transactions: Transaction[];
  categories: string[];
  variants: string[];
  currentUser: User | null;
}
