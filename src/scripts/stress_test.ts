
import { RequestContext } from '@mikro-orm/core';
import { initDI, DI } from '../di';
import { giroService } from '../services/GiroService';
import { User } from '../entities/User';
import { Minorista } from '../entities/Minorista';
import { Bank } from '../entities/Bank';
import { ExchangeRate } from '../entities/ExchangeRate';
import { Currency } from '../entities/Bank';
import { ExecutionType } from '../entities/Giro';

async function runStressTest() {
    console.log('Initializing DI...');
    await initDI();
    const em = DI.orm.em.fork();

    try {
        console.log('Setting up test data...');

        // 1. Find Test User (Jesús Segura)
        const user = await em.findOne(User, { fullName: 'Jesús Segura' });
        if (!user) throw new Error('User Jesús Segura not found');

        // 2. Find Minorista profile
        const minorista = await em.findOne(Minorista, { user: user.id });
        if (!minorista) throw new Error('Minorista profile not found');

        // 3. Ensure sufficient credit
        console.log(`Current Available Credit: ${minorista.availableCredit}`);
        minorista.availableCredit = 100000000; // Give plenty of credit
        await em.persistAndFlush(minorista);
        console.log('Updated Available Credit to 100,000,000 for testing');

        // 4. Find a Bank
        const bank = await em.findOne(Bank, { name: 'BANESCO' });
        if (!bank) throw new Error('Bank BANESCO not found');

        // 5. Get latest Exchange Rate or create one
        const rates = await em.find(ExchangeRate, {}, { orderBy: { createdAt: 'DESC' }, limit: 1 });
        let rate = rates[0];

        if (!rate) {
            console.log('No exchange rate found. Creating default rate...');
            // @ts-ignore
            rate = em.create(ExchangeRate, {
                buyRate: 3800,
                sellRate: 4000,
                usd: 1.0,
                bcv: 3900,
                createdBy: user,
                isCustom: false
            });
            await em.persistAndFlush(rate);
        }

        // 6. Define Payload
        const payload = {
            minoristaId: minorista.id,
            beneficiaryName: 'Stress Test User',
            beneficiaryId: '12345678',
            bankId: bank.id,
            accountNumber: '01341234123412341234',
            phone: '04141234567',
            amountInput: 10000, // 10,000 COP
            currencyInput: Currency.COP,
            amountBs: 10000 / rate.sellRate, // Approx
            rateApplied: rate,
            executionType: ExecutionType.PAGO_MOVIL,
        };

        // 7. Run Stress Test
        const CONCURRENCY = 50;
        console.log(`Starting stress test with ${CONCURRENCY} concurrent requests...`);

        const startTime = Date.now();
        const promises = [];

        for (let i = 0; i < CONCURRENCY; i++) {
            promises.push(
                RequestContext.create(DI.orm.em, async () => {
                    // @ts-ignore
                    return giroService.createGiro({ ...payload, beneficiaryName: `Stress Test ${i}` }, user);
                })
                    .then(result => ({ status: 'fulfilled', value: result }))
                    .catch(error => ({ status: 'rejected', reason: error }))
            );
        }

        const results = await Promise.all(promises);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        // 8. Analyze Results
        let successCount = 0;
        let failCount = 0;

        results.forEach((r: any) => {
            if (r.status === 'fulfilled' && !('error' in r.value)) {
                successCount++;
            } else {
                failCount++;
                if (r.status === 'rejected') {
                    console.error('Request failed:', r.reason);
                    if (r.reason instanceof Error) {
                        console.error('Error stack:', r.reason.stack);
                    }
                }
                if (r.status === 'fulfilled' && 'error' in r.value) console.error('Request error:', r.value.error);
            }
        });

        console.log('------------------------------------------------');
        console.log(`Stress Test Completed in ${duration.toFixed(2)} seconds`);
        console.log(`Total Requests: ${CONCURRENCY}`);
        console.log(`Successful: ${successCount}`);
        console.log(`Failed: ${failCount}`);
        console.log(`Requests per second: ${(CONCURRENCY / duration).toFixed(2)}`);
        console.log('------------------------------------------------');

    } catch (error) {
        console.error('Stress test failed:', error);
    } finally {
        await DI.orm.close();
    }
}

runStressTest();
