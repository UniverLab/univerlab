import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const paper = readFileSync(resolve(__dirname, '../components/TodaysPaper.astro'), 'utf8');
const news = readFileSync(resolve(__dirname, '../pages/newspaper.astro'), 'utf8');
const newsEs = readFileSync(resolve(__dirname, '../pages/es/newspaper.astro'), 'utf8');
const edition = readFileSync(resolve(__dirname, '../lib/today-edition.ts'), 'utf8');
const plate = readFileSync(resolve(__dirname, '../lib/paper-plate.ts'), 'utf8');

describe('the masthead is the only h1 of the page', () => {
  it('names the masthead as the page h1', () => {
    expect(paper).toContain('<h1 class="masthead-name">');
  });

  it('neither newspaper page carries its own h1', () => {
    expect(news).not.toContain('<h1');
    expect(newsEs).not.toContain('<h1');
  });

  it('neither newspaper page opens with its own band', () => {
    expect(news).not.toContain('page-open');
    expect(newsEs).not.toContain('page-open');
    expect(news).not.toContain('Postcard');
    expect(newsEs).not.toContain('Postcard');
  });

  it('the masthead carries no plate: the engraving moved into the paper grid', () => {
    expect(paper).not.toContain('Postcard');
    expect(paper).not.toContain('masthead-fig');
    expect(plate).toContain('<figure class="photo paper-plate">');
    expect(edition).toContain('paperPlateHtml');
  });

  it('the masthead prints the new name over the centred motto', () => {
    // The paper was renamed from El Almanaque / The Almanac.
    expect(en.today.name).toBe('The Observable');
    expect(es.today.name).toBe('El Observable');
    expect(en.today.path).toBe('univerlab.org/newspaper');
    expect(es.today.path).toBe('univerlab.org/newspaper');
    // The letters keep their band name.
    expect(es.header.mailbox.bandPast).toBe('Correo del pasado');
    expect(paper).toContain('{t.today.name}');
    expect(paper).toContain('{t.today.motto}');
    expect(paper).toMatch(/\.paper \.masthead \.motto \{[^}]*text-align: center/);
  });

  it('both page titles carry the new name', () => {
    expect(news).toContain('title="The Observable — UniverLab"');
    expect(newsEs).toContain('title="El Observable — UniverLab"');
  });
});
