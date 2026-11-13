import { mkdirSync, writeFileSync } from "fs";
import { randomBytes, scryptSync } from "crypto";
import { dirname, join } from "path";

const file = join(process.cwd(), "data", "e2e-store.json");
mkdirSync(dirname(file), { recursive: true });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const now = new Date().toISOString();
const store = {
  admin: { passwordHash: hashPassword("e2e-password"), createdAt: now },
  settings: {
    secret: "e2e-secret",
    shopName: "Radiant",
    tagline: "",
    announcement: "",
    shippingFee: 70,
    freeShippingThreshold: 2000,
    paymentNote: "測試付款說明",
    lineOaName: "",
    lineOaBasicId: "",
    lineOaUrl: "",
    loginChannelId: "123",
    loginChannelSecret: "secret",
    messagingToken: "",
    notifyTo: "",
    pickupPoints: [],
  },
  products: [
    {
      id: "prd_top",
      name: "測試珍珠上衣",
      subtitle: "",
      category: "正韓服飾",
      categories: [],
      description: "",
      details: [{ label: "尺寸", value: "S,M,L" }],
      price: 1080,
      comparePrice: 1280,
      variants: [{ id: "var_coffee", color: "咖啡", size: "", hex: "#d9d9d9", sku: "", stock: 9, price: null }],
      photos: [],
      status: "listed",
      featured: false,
      sold: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "prd_sold",
      name: "已售完銀蔥上衣",
      subtitle: "",
      category: "上衣",
      categories: [],
      description: "",
      details: [],
      price: 1280,
      comparePrice: 0,
      variants: [{ id: "var_blue", color: "藍", size: "M", hex: "#d9d9d9", sku: "", stock: 0, price: null }],
      photos: [],
      status: "listed",
      featured: false,
      sold: 0,
      createdAt: now,
      updatedAt: now,
    },
  ],
  customers: [{ id: "cus_1", lineUserId: "U1", lineName: "LEAKPROBE", lineId: "", phone: "", verified: true, note: "", createdAt: now, lastOrderAt: now }],
  orders: [
    {
      id: "ord_1",
      code: "RDLEAK",
      token: "tok",
      customerId: "cus_1",
      recipient: "LEAKPROBE",
      phone: "0912000000",
      address: "測試地址",
      fulfillment: "delivery",
      pickupPointId: "",
      pickupPointName: "",
      note: "",
      items: [{ productId: "prd_top", variantId: "var_coffee", name: "測試珍珠上衣", color: "咖啡", size: "M", hex: "#6f4e37", price: 1080, qty: 1, photo: "" }],
      subtotal: 1080,
      shipping: 70,
      total: 1150,
      status: "pending",
      internalNote: "",
      createdAt: now,
      updatedAt: now,
    },
  ],
  wallPhotos: [],
  idempotency: [],
  loginBuckets: [],
};

writeFileSync(file, JSON.stringify(store));
console.log("seeded", file);
