import 'package:flutter/material.dart';
import 'package:tamcar_shared/tamcar_shared.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TamCarColors.neutral0,
      appBar: AppBar(
        title: const Text('TamCar'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(TamCarSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Où allez-vous ?', style: TamCarTypography.headingMd),
            const SizedBox(height: TamCarSpacing.lg),
            const TextField(
              decoration: InputDecoration(
                hintText: 'Adresse de destination',
                prefixIcon: Icon(Icons.place_outlined),
              ),
            ),
            const SizedBox(height: TamCarSpacing.xl),
            FilledButton(
              onPressed: () {},
              child: const Text('Commander une course'),
            ),
            const SizedBox(height: TamCarSpacing.md),
            OutlinedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.event_outlined),
              label: const Text('Réserver à l\'avance'),
            ),
            const Spacer(),
            _WalletTeaser(),
            const SizedBox(height: TamCarSpacing.md),
          ],
        ),
      ),
    );
  }
}

class _WalletTeaser extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(TamCarSpacing.lg),
      decoration: BoxDecoration(
        color: TamCarColors.neutral100,
        borderRadius: BorderRadius.circular(TamCarRadius.lg),
      ),
      child: Row(
        children: [
          const Icon(Icons.account_balance_wallet_outlined,
              color: TamCarColors.primary500),
          const SizedBox(width: TamCarSpacing.md),
          const Expanded(
            child: Text('TamCar Crédit', style: TamCarTypography.bodyLg),
          ),
          Text(
            '0 FCFA',
            style: TamCarTypography.monoPrice.copyWith(
              color: TamCarColors.neutral900,
            ),
          ),
        ],
      ),
    );
  }
}
