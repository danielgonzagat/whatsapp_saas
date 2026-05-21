export interface ShippingAddress {
  cep?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  recipientName?: string;
  [key: string]: unknown;
}
