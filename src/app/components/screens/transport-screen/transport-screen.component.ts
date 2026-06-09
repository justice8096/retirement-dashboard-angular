import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-transport-screen',
  standalone: true,
  imports: [CostDetailComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<app-cost-detail costKey="transportation" />`,
})
export class TransportScreenComponent {}
