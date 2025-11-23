export interface OrderMatchedEventArgs {
	user: string;
	buyOrderId: bigint;
	sellOrderId: bigint;
	side: number;
	timestamp: number;
	executionPrice: bigint;
	executedQuantity: bigint;
}

export interface OrderPlacedEventArgs {
	orderId: bigint;
	user: string;
	side: number;
	price: bigint;
	quantity: bigint;
	expiry: number;
	isMarketOrder: boolean;
	status: number;
}

export interface UpdateOrderEventArgs {
	orderId: bigint;
	timestamp: number;
	filled: bigint;
	status: number;
	side?: number;
}
