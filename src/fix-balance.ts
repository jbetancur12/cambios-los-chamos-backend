
import { MikroORM } from '@mikro-orm/core';
import config from './mikro-orm.config';
import { Minorista } from './entities/Minorista';
import { MinoristaTransaction, MinoristaTransactionType } from './entities/MinoristaTransaction';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkBalance() {
    const orm = await MikroORM.init(config);
    const em = orm.em.fork();

    try {
        // Find Minorista by email
        const minorista = await em.findOne(Minorista, { user: { email: 'orligginau@gmail.com' } }, { populate: ['user'] });

        if (!minorista) {
            console.log('❌ Minorista not found');
            return;
        }

        console.log(`Checking balance for: ${minorista.user.fullName} (${minorista.id})`);
        console.log(`Current DB Balance (creditBalance): ${minorista.creditBalance}`);
        console.log(`Current DB Available Credit: ${minorista.availableCredit}`);
        console.log(`Credit Limit: ${minorista.creditLimit}`);

        // Fetch ALL transactions
        const transactions = await em.find(MinoristaTransaction, { minorista: minorista.id });

        console.log(`Found ${transactions.length} transactions.`);

        let calculatedDebt = 0;

        for (const t of transactions) {
            // Logic:
            // DISCOUNT (Giro): Increases Debt. (Amount - Profit?? No, usually full Amount is debt? Wait.)
            // Let's check logic:
            // If I send 100k. System takes 100k credit.
            // If profit is 5k. Does system take 95k?
            // Log says: Amount 60k, Profit 3k, Net Debt +57k.
            // So Debt += (Amount - Profit).

            let netChange = 0;

            if (t.type === MinoristaTransactionType.DISCOUNT) {
                // Debt increases by (Amount - Profit)
                // Assuming amount is the "Cost to Minorista"?
                // Let's re-read the log: Amount 60,000. Profit 3,000.
                // Debt change 57,000.
                // So yes: Change = Amount - Profit.
                netChange = Number(t.amount) - (Number(t.profitEarned) || 0);
                calculatedDebt += netChange;
            } else if (t.type === MinoristaTransactionType.RECHARGE) {
                // Recharge reduces debt.
                // Amount is simply amount.
                calculatedDebt -= Number(t.amount);
            } else if (t.type === MinoristaTransactionType.REFUND) {
                // Refund reduces debt (reverses discount).
                // Should be -(Amount - Profit) roughly?
                // Usually Refund amount IS the net amount?
                // Let's assume Refund Amount is the value being returned.
                calculatedDebt -= Number(t.amount);
            } else if (t.type === MinoristaTransactionType.ADJUSTMENT) {
                // Adjustment logic depends on sign? Assuming Amount is signed or directs debt.
                // Usually Adjustment adds to balance (reduces debt) if positive?
                // Let's assume positive Adjustment = Payment/Credit = Reduce Debt.
                // Wait, need to be careful.
                // Let's just sum RAW amounts based on type for now.
                // If transaction.amount is always positive in DB:
                calculatedDebt += Number(t.amount); // Placehoder
            }
        }

        // Better Approach:
        // Some systems track "Balance" where + is good, - is debt.
        // Minorista has "creditBalance".
        // Let's use the DB's `transaction.remainingBalance` or `accumulatedDebt` from the LAST transaction as a checkpoint?
        // No, we want to SUM purely.

        // Let's try a simpler sum:
        // Total Discounts (Net) - Total Recharges - Total Refunds.

        let totalDiscounts = 0;
        let totalProfits = 0;
        let totalRecharges = 0;
        let totalRefunds = 0;

        for (const t of transactions) {
            const amt = Number(t.amount);
            const profit = Number(t.profitEarned) || 0;

            if (t.type === MinoristaTransactionType.DISCOUNT) {
                totalDiscounts += amt;
                totalProfits += profit;
            } else if (t.type === MinoristaTransactionType.RECHARGE) {
                totalRecharges += amt;
            } else if (t.type === MinoristaTransactionType.REFUND) {
                totalRefunds += amt;
            }
        }

        const netDebtCalculated = (totalDiscounts - totalProfits) - totalRecharges - totalRefunds;

        console.log('--- Calculation ---');
        console.log(`Total Discounts (Raw): ${totalDiscounts}`);
        console.log(`Total Profits: ${totalProfits}`);
        console.log(`Total Recharges: ${totalRecharges}`);
        console.log(`Total Refunds: ${totalRefunds}`);
        console.log(`Calculated Net Debt: ${netDebtCalculated}`);
        console.log(`Diff (DB - Calculated): ${minorista.creditBalance - netDebtCalculated}`);

        // APPLY FIX
        const limit = minorista.creditLimit; // 500,000
        // Debt = 219,379.
        // Available = Limit - Debt = 500,000 - 219,379 = 280,621.
        // Balance In Favor (Positive) = 0 (Since there is debt).

        // Safety check: netDebtCalculated (219,379) is positive? Yes, because discounts > recharges.
        // If netDebtCalculated (Debt) is positive, then BalanceInFavor is 0.

        let newAvailable = 0;
        let newCreditBalance = 0;

        if (netDebtCalculated > 0) {
            newAvailable = limit - netDebtCalculated;
            newCreditBalance = 0;
        } else {
            // Negative debt means Surplus (Balance in Favor)
            newAvailable = limit;
            newCreditBalance = Math.abs(netDebtCalculated);
        }

        console.log(`APPLYING FIX:`);
        console.log(`New Available Credit: ${newAvailable}`);
        console.log(`New Credit Balance (Favor): ${newCreditBalance}`);

        minorista.availableCredit = newAvailable;
        minorista.creditBalance = newCreditBalance;

        await em.persistAndFlush(minorista);
        console.log('✅ Balance correct successfully!');

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await orm.close();
    }
}

checkBalance();
