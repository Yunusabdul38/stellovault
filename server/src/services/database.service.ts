import { prisma } from "../config/prisma";


export class DatabaseService {
    async createUser(stellarAddress: string, options?: { label?: string; isPrimary?: boolean }) {
        return prisma.$transaction(async (tx: any) => {
            const user = await tx.user.create({
                data: {
                    stellarAddress,
                    name: null,
                    role: "USER",
                },
            });

            const wallet = await tx.wallet.create({
                data: {
                    userId: user.id,
                    address: stellarAddress,
                    isPrimary: options?.isPrimary ?? true,
                    label: options?.label ?? null,
                },
            });

            return { user, wallet };
        });
    }
    async getLoanById(id: string) {
        return prisma.loan.findUnique({
            where: { id },
            include: { borrower: true },
        });
    }

    async updateLoanStatus(id: string, status: any) {
        return prisma.loan.update({
            where: { id },
            data: { status },
        });
    }
}

export default new DatabaseService();
export { prisma };
