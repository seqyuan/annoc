#!/usr/bin/env node

/**
 * Standalone test script to load and inspect Seurat RDS files
 * This simulates what happens in the browser worker
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test file path
const testFilePath = '/Volumes/data/co_project/AA/A04/analysis/02.harmony/clusters.rds';

console.log('='.repeat(60));
console.log('Seurat RDS File Loading Test');
console.log('='.repeat(60));
console.log();

async function testLoad() {
  try {
    // Step 1: Import scran.js
    console.log('[1/6] Importing scran.js...');
    const scran = await import('scran.js');
    console.log('✓ scran.js imported successfully');
    console.log();

    // Step 2: Initialize scran.js
    console.log('[2/6] Initializing scran.js...');
    await scran.initialize({ numberOfThreads: 1 });
    console.log('✓ scran.js initialized');
    console.log();

    // Step 3: Read file
    console.log('[3/6] Reading RDS file...');
    console.log(`File: ${testFilePath}`);
    const buffer = readFileSync(testFilePath);
    console.log(`✓ File read: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log();

    // Step 4: Parse RDS
    console.log('[4/6] Parsing RDS with scran.readRds...');
    const rdsHandle = scran.readRds(buffer);
    console.log('✓ RDS parsed successfully');
    console.log(`  Type: ${rdsHandle?.constructor?.name}`);
    console.log();

    // Step 5: Check if Seurat object
    console.log('[5/6] Checking if Seurat object...');

    if (!(rdsHandle instanceof scran.RdsS4Object)) {
      throw new Error('Not an RdsS4Object');
    }
    console.log('✓ Is RdsS4Object');

    const className = rdsHandle.className();
    const packageName = rdsHandle.packageName();
    console.log(`  Class: ${className}`);
    console.log(`  Package: ${packageName}`);

    const isSeurat = (className === "Seurat" && packageName === "SeuratObject") ||
                     (className === "Seurat" && packageName === "Seurat");

    if (!isSeurat) {
      throw new Error(`Not a Seurat object (class: ${className}, package: ${packageName})`);
    }
    console.log('✓ Confirmed Seurat object');
    console.log();

    // Step 6: Extract structure
    console.log('[6/6] Extracting Seurat structure...');

    // Check for assays
    console.log('\n--- Checking @assays slot ---');
    const assaysHandle = rdsHandle.attribute("assays");
    if (assaysHandle) {
      console.log('✓ @assays found');
      if (assaysHandle instanceof scran.RdsGenericVector) {
        const namesIdx = assaysHandle.findAttribute("names");
        if (namesIdx >= 0) {
          const namesHandle = assaysHandle.attribute(namesIdx);
          const assayNames = namesHandle.values();
          console.log(`  Assays: ${assayNames.join(', ')}`);
          scran.free(namesHandle);
        }
      }
      scran.free(assaysHandle);
    } else {
      console.log('✗ @assays not found');
    }

    // Check for meta.data
    console.log('\n--- Checking @meta.data slot ---');
    const metaIdx = rdsHandle.findAttribute("meta.data");
    if (metaIdx >= 0) {
      const metaHandle = rdsHandle.attribute(metaIdx);
      console.log('✓ @meta.data found');
      if (metaHandle instanceof scran.RdsGenericVector) {
        const namesIdx = metaHandle.findAttribute("names");
        if (namesIdx >= 0) {
          const namesHandle = metaHandle.attribute(namesIdx);
          const colNames = namesHandle.values();
          console.log(`  Columns (${colNames.length}): ${colNames.slice(0, 10).join(', ')}${colNames.length > 10 ? '...' : ''}`);
          scran.free(namesHandle);
        }
      }
      scran.free(metaHandle);
    } else {
      console.log('✗ @meta.data not found');
    }

    // Check for reductions
    console.log('\n--- Checking @reductions slot ---');
    const reductionsIdx = rdsHandle.findAttribute("reductions");
    if (reductionsIdx >= 0) {
      const reductionsHandle = rdsHandle.attribute(reductionsIdx);
      console.log('✓ @reductions found');
      if (reductionsHandle instanceof scran.RdsGenericVector) {
        const namesIdx = reductionsHandle.findAttribute("names");
        if (namesIdx >= 0) {
          const namesHandle = reductionsHandle.attribute(namesIdx);
          const redNames = namesHandle.values();
          console.log(`  Reductions: ${redNames.join(', ')}`);
          scran.free(namesHandle);
        }
      }
      scran.free(reductionsHandle);
    } else {
      console.log('✗ @reductions not found');
    }

    // Cleanup
    scran.free(rdsHandle);

    console.log();
    console.log('='.repeat(60));
    console.log('✓ TEST PASSED - Seurat object loaded successfully');
    console.log('='.repeat(60));

  } catch (error) {
    console.log();
    console.log('='.repeat(60));
    console.log('✗ TEST FAILED');
    console.log('='.repeat(60));
    console.error('\nError:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

testLoad();
