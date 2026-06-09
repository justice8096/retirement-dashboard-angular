import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-vision-screen',
  standalone: true,
  imports: [CostDetailComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<app-cost-detail costKey="healthcare" />`,
})
export class VisionScreenComponent {}
