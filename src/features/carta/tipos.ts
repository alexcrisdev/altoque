export type Categoria = {
  id: string;
  name: string;
};

export type Producto = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  available: boolean;
  ingredients: string | null;
  allergens: string[];
  // US-103: unidades que quedan hoy. Sin límite de stock queda vacío.
  quedan?: number | null;
};

// US-103: lo único que la carta vuelve a consultar cada pocos segundos.
export type DisponibilidadProducto = {
  id: string;
  available: boolean;
  quedan: number | null;
};

export type CategoriaConProductos = Categoria & { productos: Producto[] };
