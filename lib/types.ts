export type ProductStatus = "listed" | "unlisted";

export type Variant = {
  id: string;
  color: string;
  hex: string;
  sku: string;
  stock: number;
  price: number | null;
};

export type Detail = { label: string; value: string };

export type Product = {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  description: string;
  details: Detail[];
  price: number;
  comparePrice: number;
  variants: Variant[];
  photos: string[];
  status: ProductStatus;
  featured: boolean;
  sold: number;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "cancelled";

export type OrderItem = {
  productId: string;
  variantId: string;
  name: string;
  color: string;
  hex: string;
  price: number;
  qty: number;
  photo: string;
};

export type Customer = {
  id: string;
  lineUserId: string;
  lineName: string;
  lineId: string;
  verified: boolean;
  note: string;
  createdAt: string;
  lastOrderAt: string;
};

export type Order = {
  id: string;
  code: string;
  token: string;
  customerId: string;
  recipient: string;
  phone: string;
  address: string;
  note: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  internalNote: string;
  createdAt: string;
  updatedAt: string;
};

export type WallPhoto = {
  id: string;
  src: string;
  productId: string;
};

export type Settings = {
  secret: string;
  shopName: string;
  tagline: string;
  announcement: string;
  shippingFee: number;
  freeShippingThreshold: number;
  paymentNote: string;
  lineOaName: string;
  lineOaBasicId: string;
  lineOaUrl: string;
  loginChannelId: string;
  loginChannelSecret: string;
  messagingToken: string;
  notifyTo: string;
};

export type Admin = { passwordHash: string; createdAt: string };

export type Store = {
  admin: Admin | null;
  settings: Settings;
  products: Product[];
  customers: Customer[];
  orders: Order[];
  wallPhotos: WallPhoto[];
};
