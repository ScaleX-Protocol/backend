import { pushExecutionReport as pushExecutionReportToWebSocket } from "../websocket/broadcaster";

export function pushExecutionReport(
	symbol: string,
	user: string,
	order: any,
	execType: string,
	status: string,
	lastQty: bigint,
	lastPrice: bigint,
	ts: number
) {
	pushExecutionReportToWebSocket(user, {
		e: "executionReport",
		E: ts,
		s: symbol,
		i: order.orderId.toString(),
		S: order.side.toUpperCase(),
		o: order.type.toUpperCase(),
		X: status,
		x: execType,
		q: order.quantity.toString(),
		z: order.filled.toString(),
		l: lastQty.toString(),
		p: order.price.toString(),
		L: lastPrice.toString(),
		T: ts,
	});
}
