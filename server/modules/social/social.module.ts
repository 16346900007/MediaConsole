import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { ContentsController } from './contents.controller';
import { ContentsService } from './contents.service';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BrowserAuthService } from './auth/browser-auth.service';
import { OpenExternalController } from './open-external.controller';
import { AppController } from './app.controller';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  imports: [],
  controllers: [
    AccountsController,
    ContentsController,
    MetricsController,
    MaterialsController,
    AuthController,
    OpenExternalController,
    AppController,
    DataController,
    FilesController,
    PublishController,
    TopicsController,
  ],
  providers: [
    AccountsService,
    ContentsService,
    MetricsService,
    MaterialsService,
    AuthService,
    BrowserAuthService,
    DataService,
    FilesService,
    PublishService,
    TopicsService,
  ],
})
export class SocialModule {}
