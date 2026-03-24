#!/usr/bin/env node

/**
 * Test script for reading Seurat RDS files
 * Usage: node test-rds-reader.js <path-to-rds-file>
 */

const fs = require('fs');
const path = require('path');

// Import scran.js (bakana uses it internally)
let scran;

async function initScran() {
    console.log('Initializing scran.js...');
    try {
        scran = await import('scran.js');
        await scran.initialize({ numberOfThreads: 1 });
        console.log('✓ scran.js initialized successfully\n');
        return true;
    } catch (error) {
        console.error('✗ Failed to initialize scran.js:', error.message);
        return false;
    }
}

async function testReadRDS(filePath) {
    console.log('========================================');
    console.log(`Testing RDS file: ${filePath}`);
    console.log('========================================\n');

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`✗ File not found: ${filePath}`);
        process.exit(1);
    }

    const stats = fs.statSync(filePath);
    console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

    try {
        // Step 1: Read file
        console.log('Step 1: Reading file...');
        const buffer = fs.readFileSync(filePath);
        console.log(`✓ File read successfully (${buffer.length} bytes)\n`);

        // Step 2: Convert to Uint8Array
        console.log('Step 2: Converting to Uint8Array...');
        const uint8Array = new Uint8Array(buffer);
        console.log(`✓ Converted to Uint8Array (length: ${uint8Array.length})\n`);

        // Step 3: Parse RDS
        console.log('Step 3: Parsing RDS file with scran.js...');
        const parsed = scran.readRds(uint8Array);
        console.log('✓ RDS parsed successfully\n');

        // Step 4: Inspect structure
        console.log('Step 4: Inspecting parsed object...');
        console.log(`Type: ${typeof parsed}`);
        console.log(`Constructor: ${parsed?.constructor?.name || 'unknown'}\n`);

        if (parsed && typeof parsed === 'object') {
            const keys = Object.keys(parsed);
            console.log(`Object keys (${keys.length}):`);
            keys.forEach(key => {
                const value = parsed[key];
                const valueType = typeof value;
                let valueInfo;

                if (valueType === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        valueInfo = `Array (length: ${value.length})`;
                    } else {
                        const objKeys = Object.keys(value);
                        valueInfo = `${value.constructor?.name || 'Object'} (${objKeys.length} keys)`;
                    }
                } else {
                    valueInfo = valueType;
                }

                console.log(`  - ${key}: ${valueInfo}`);
            });

            // Check for Seurat structure
            console.log('\nChecking for Seurat object structure...');
            const seuratProps = ['assays', 'meta.data', 'reductions', 'active.assay', 'active.ident'];
            seuratProps.forEach(prop => {
                const hasProp = prop in parsed;
                console.log(`  ${hasProp ? '✓' : '✗'} ${prop}: ${hasProp ? 'found' : 'not found'}`);
            });

            // Inspect meta.data
            if (parsed['meta.data']) {
                console.log('\n--- meta.data ---');
                const metadata = parsed['meta.data'];
                console.log(`Type: ${metadata?.constructor?.name || typeof metadata}`);

                if (metadata && typeof metadata === 'object') {
                    const metaKeys = Object.keys(metadata);
                    console.log(`Keys (${metaKeys.length}): ${metaKeys.slice(0, 20).join(', ')}${metaKeys.length > 20 ? '...' : ''}`);

                    // Sample first few entries
                    if (metaKeys.length > 0) {
                        console.log('\nFirst entry sample:');
                        const firstKey = metaKeys[0];
                        const firstValue = metadata[firstKey];
                        console.log(`  ${firstKey}: ${JSON.stringify(firstValue).slice(0, 200)}`);
                    }
                }
            }

            // Inspect assays
            if (parsed.assays) {
                console.log('\n--- assays ---');
                const assays = parsed.assays;
                console.log(`Type: ${assays?.constructor?.name || typeof assays}`);

                if (assays && typeof assays === 'object') {
                    const assayKeys = Object.keys(assays);
                    console.log(`Assays (${assayKeys.length}): ${assayKeys.join(', ')}`);

                    // Inspect first assay
                    if (assayKeys.length > 0) {
                        const firstAssay = assays[assayKeys[0]];
                        console.log(`\nFirst assay (${assayKeys[0]}):`);
                        console.log(`  Type: ${firstAssay?.constructor?.name || typeof firstAssay}`);
                        if (firstAssay && typeof firstAssay === 'object') {
                            const assayProps = Object.keys(firstAssay);
                            console.log(`  Properties: ${assayProps.join(', ')}`);
                        }
                    }
                }
            }

            // Inspect reductions
            if (parsed.reductions) {
                console.log('\n--- reductions ---');
                const reductions = parsed.reductions;
                console.log(`Type: ${reductions?.constructor?.name || typeof reductions}`);

                if (reductions && typeof reductions === 'object') {
                    const reductionKeys = Object.keys(reductions);
                    console.log(`Reductions (${reductionKeys.length}): ${reductionKeys.join(', ')}`);

                    // Inspect each reduction
                    reductionKeys.forEach(redKey => {
                        const reduction = reductions[redKey];
                        console.log(`\n  ${redKey}:`);
                        console.log(`    Type: ${reduction?.constructor?.name || typeof reduction}`);
                        if (reduction && typeof reduction === 'object') {
                            const redProps = Object.keys(reduction);
                            console.log(`    Properties: ${redProps.join(', ')}`);

                            // Check for cell.embeddings
                            if (reduction['cell.embeddings']) {
                                const embeddings = reduction['cell.embeddings'];
                                console.log(`    cell.embeddings type: ${embeddings?.constructor?.name || typeof embeddings}`);
                                if (embeddings && typeof embeddings === 'object') {
                                    const embKeys = Object.keys(embeddings);
                                    console.log(`    cell.embeddings keys: ${embKeys.slice(0, 5).join(', ')}${embKeys.length > 5 ? '...' : ''}`);
                                }
                            }
                        }
                    });
                }
            }
        }

        console.log('\n========================================');
        console.log('✓ TEST COMPLETED SUCCESSFULLY');
        console.log('========================================');

    } catch (error) {
        console.log('\n========================================');
        console.error('✗ TEST FAILED');
        console.log('========================================');
        console.error(`\nError: ${error.message}`);
        console.error(`\nStack trace:\n${error.stack}`);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node test-rds-reader.js <path-to-rds-file>');
        console.log('\nExample:');
        console.log('  node test-rds-reader.js /Volumes/data/co_project/AA/A04/analysis/02.harmony/clusters.rds');
        process.exit(1);
    }

    const filePath = args[0];

    const initialized = await initScran();
    if (!initialized) {
        process.exit(1);
    }

    await testReadRDS(filePath);
}

main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
