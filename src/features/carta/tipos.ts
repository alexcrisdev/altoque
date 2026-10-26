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
  ingredients?: string | null;
  allergens?: string[];
};

export type CategoriaConProductos = Categoria & { productos: Producto[] };
