export type ProductStatus = "listed" | "unlisted";

export type Variant = {
  id: string;
  color: string;
  /** Empty string means one-size (均碼). */
  size: string;
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
  /** Primary category shown on the product page. */
  category: string;
  /** Extra categories. Storefront matching also applies apparel aliases. */
  categories: string[];
  description: string;
  details: Detail[];
  price: number;
  comparePrice: number;
  variants: Variant[];
  photos: string[];
  status: ProductStatus;
  featured: boolean;
  sold: number;
  /**
   * True when sizes were split from a free-text 尺寸 note and stock was
   * divided evenly. Cleared the next time staff save the product.
   */
  sizeStockEstimated?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "cancelled";
export type Fulfillment = "delivery" | "pickup" | "cvs";
/** line: staff confirm over LINE. online: card / Apple Pay on NewebPay. cod: pay at the convenience store. */
export type PaymentMethod = "line" | "online" | "cod";

export type CvsInfo = {
  storeCode: string;
  storeName: string;
  storeAddr: string;
  /** 7-ELEVEN / 全家 / 萊爾富 / OK mart, as reported by NewebPay. */
  storeType: string;
  pickupName: string;
  pickupPhone: string;
  /** 寄件代碼 — staff print the shipping label from the NewebPay dashboard. */
  lgsNo: string;
};

export type PickupPoint = {
  id: string;
  name: string;
  address: string;
  hours: string;
  note: string;
  enabled: boolean;
};

export type OrderItem = {
  productId: string;
  variantId: string;
  name: string;
  color: string;
  size: string;
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
  /** Last phone, used only to group unverified guest checkouts. */
  phone: string;
  /** Last receipt email. Order lookup uses the email stored on the order. */
  email: string;
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
  /** Receipt email sent to NewebPay. Empty on orders placed before guest checkout. */
  email: string;
  address: string;
  fulfillment: Fulfillment;
  pickupPointId: string;
  pickupPointName: string;
  paymentMethod: PaymentMethod;
  /** ISO time the card payment or COD store selection completed. Empty while unpaid. */
  paidAt: string;
  /** NewebPay TradeNo of the successful payment, voucher, or COD order. */
  payTradeNo: string;
  /** NewebPay PaymentType or wallet (CREDIT, APPLEPAY, VACC, CVS, …). */
  payType: string;
  /** ATM bank code after 取號. Empty until then. */
  payBankCode: string;
  /** ATM virtual account, CVS payment code, or barcode segments. */
  payCodeNo: string;
  /** NewebPay ExpireDate (yyyy-mm-dd) for an unpaid ATM/CVS number. */
  payExpire: string;
  /** How many NewebPay payment pages were opened (each uses its own MerchantOrderNo). */
  payAttempts: number;
  /**
   * Stock is held until this time while the customer has not finished paying
   * or choosing a store on NewebPay. Empty once the order is confirmed.
   */
  holdUntil: string;
  cvs: CvsInfo | null;
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
  /** Flat 超商店到店 fee shown at checkout (before free-shipping). */
  cvsShippingFee: number;
  freeShippingThreshold: number;
  paymentNote: string;
  lineOaName: string;
  lineOaBasicId: string;
  lineOaUrl: string;
  loginChannelId: string;
  loginChannelSecret: string;
  messagingToken: string;
  notifyTo: string;
  pickupPoints: PickupPoint[];
};

export type Admin = {
  passwordHash: string;
  createdAt: string;
  /** Enabled TOTP secret (base32). Never send this to the browser. */
  totpSecret?: string;
  /** Secret waiting for the staff member to confirm a code. */
  totpPending?: string;
};

export type IdempotencyRecord = { key: string; code: string; at: string };

export type LoginBucket = {
  id: string;
  failures: number;
  windowStart: number;
  lockedUntil: number;
};

export type Store = {
  admin: Admin | null;
  settings: Settings;
  products: Product[];
  customers: Customer[];
  orders: Order[];
  wallPhotos: WallPhoto[];
  idempotency: IdempotencyRecord[];
  loginBuckets: LoginBucket[];
};
