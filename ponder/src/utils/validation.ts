
export const isHexPoolId = (id: string): id is `0x${string}` => {
    return /^0x[0-9a-fA-F]{40}$/.test(id);
}

export const validatePoolId = (poolId: string): `0x${string}` => {
    if (!poolId) {
        console.error(`PoolId is null or undefined: ${poolId} (type: ${typeof poolId})`);
        process.exit(1);
    }
    if (isHexPoolId(poolId)) return poolId;
    console.error(`Invalid poolId format: ${poolId} (type: ${typeof poolId})`);
    process.exit(1);
}